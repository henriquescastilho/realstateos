"""Payment anomaly detection — Isolation Forest on payment features.

Detects unusual payment patterns:
- Sudden large payment (amount >> historical median)
- Payment from new/unrecognised payer account
- Timing anomaly (payment at unusual hour or day)
- Suspiciously round amounts
- Multiple payments within a short window

Flags anomalies for human review by inserting into `payment_anomalies` table.

Optional dependencies:
    scikit-learn  — IsolationForest
    numpy         — feature array construction

Graceful degradation: rule-based anomaly detection when sklearn unavailable.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional dependency guards
# ---------------------------------------------------------------------------
try:
    import numpy as np  # type: ignore
    _NUMPY_AVAILABLE = True
except ImportError:
    np = None  # type: ignore[assignment]
    _NUMPY_AVAILABLE = False

try:
    from sklearn.ensemble import IsolationForest  # type: ignore
    _SKLEARN_AVAILABLE = True
except ImportError:
    _SKLEARN_AVAILABLE = False

try:
    from sqlalchemy import text as sqla_text  # type: ignore
    _SQLA_AVAILABLE = True
except ImportError:
    _SQLA_AVAILABLE = False

# ---------------------------------------------------------------------------
# Thresholds for rule-based detection
# ---------------------------------------------------------------------------

# Amount is anomalous if > N × median historical payment for that renter
_AMOUNT_MULTIPLIER_THRESHOLD = 3.0

# Timing: hour-of-day outside normal business hours (BRT 06:00–22:00 = UTC 09:00–01:00)
_NORMAL_HOURS_UTC_START = 9
_NORMAL_HOURS_UTC_END = 25  # 01:00 next day

# Round amount threshold: amounts that are suspiciously round (multiples of 1000)
_ROUND_AMOUNT_MULTIPLE = 1000.0

# Isolation Forest contamination (expected fraction of anomalies)
_IF_CONTAMINATION = 0.05


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class PaymentFeatures:
    payment_id: str
    amount: float
    historical_median_amount: float
    days_since_last_payment: float
    hour_of_day_utc: int
    day_of_week: int             # 0=Monday…6=Sunday
    is_new_payer_account: bool
    amount_ratio: float = 0.0    # amount / historical_median_amount
    is_round_amount: bool = False

    def to_array(self) -> list[float]:
        return [
            self.amount,
            self.amount_ratio,
            float(self.days_since_last_payment),
            float(self.hour_of_day_utc),
            float(self.day_of_week),
            float(int(self.is_new_payer_account)),
            float(int(self.is_round_amount)),
        ]


@dataclass
class AnomalyResult:
    payment_id: str
    is_anomaly: bool
    anomaly_score: float         # [-1, 1] for IF; [0, 1] for rule-based
    reasons: list[str] = field(default_factory=list)
    detected_at: datetime = field(default_factory=lambda: datetime.now(tz=timezone.utc))
    review_required: bool = False


# ---------------------------------------------------------------------------
# Feature extraction
# ---------------------------------------------------------------------------

def extract_payment_features(db: Any, payment_id: str) -> PaymentFeatures | None:
    """Query DB for features of a single payment."""
    if not _SQLA_AVAILABLE:
        return None

    try:
        row = db.execute(
            sqla_text(
                """
                WITH history AS (
                    SELECT
                        ch.renter_id,
                        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ch.paid_amount) AS median_amt,
                        MAX(ch.paid_at) AS last_paid
                    FROM charges ch
                    WHERE ch.renter_id = (
                        SELECT renter_id FROM charges WHERE id = :pid LIMIT 1
                    )
                      AND ch.status = 'paid'
                      AND ch.id != :pid
                    GROUP BY ch.renter_id
                )
                SELECT
                    c.id,
                    c.paid_amount,
                    COALESCE(h.median_amt, c.paid_amount) AS median_amt,
                    COALESCE(EXTRACT(EPOCH FROM (c.paid_at - h.last_paid)) / 86400, 30) AS days_since,
                    EXTRACT(HOUR FROM c.paid_at AT TIME ZONE 'UTC') AS hour_utc,
                    EXTRACT(DOW FROM c.paid_at) AS dow,
                    -- New payer: payer_document never seen before for this renter
                    CASE WHEN (
                        SELECT COUNT(*) FROM charges c2
                        WHERE c2.renter_id = c.renter_id
                          AND c2.payer_document = c.payer_document
                          AND c2.id != c.id
                    ) = 0 THEN TRUE ELSE FALSE END AS is_new_payer
                FROM charges c
                LEFT JOIN history h ON h.renter_id = c.renter_id
                WHERE c.id = :pid
                """
            ),
            {"pid": payment_id},
        ).fetchone()

        if row is None:
            return None

        amount = float(row[1] or 0)
        median = float(row[2] or 0)
        ratio = amount / median if median > 0 else 1.0
        is_round = (amount % _ROUND_AMOUNT_MULTIPLE) == 0 and amount >= _ROUND_AMOUNT_MULTIPLE

        return PaymentFeatures(
            payment_id=payment_id,
            amount=amount,
            historical_median_amount=median,
            days_since_last_payment=float(row[3] or 30),
            hour_of_day_utc=int(row[4] or 12),
            day_of_week=int(row[5] or 1),
            is_new_payer_account=bool(row[6]),
            amount_ratio=ratio,
            is_round_amount=is_round,
        )

    except Exception as exc:
        logger.warning("anomaly_detector: feature extraction failed payment=%s: %s", payment_id, exc)
        return None


# ---------------------------------------------------------------------------
# Rule-based detection (fallback)
# ---------------------------------------------------------------------------

def _rule_based_detect(features: PaymentFeatures) -> AnomalyResult:
    reasons: list[str] = []

    if features.amount_ratio > _AMOUNT_MULTIPLIER_THRESHOLD:
        reasons.append(
            f"amount {features.amount:.2f} is {features.amount_ratio:.1f}x the historical median"
        )

    if features.is_new_payer_account:
        reasons.append("payment from unrecognised payer account")

    hour = features.hour_of_day_utc
    if not (_NORMAL_HOURS_UTC_START <= hour <= 23 or 0 <= hour < (_NORMAL_HOURS_UTC_END - 24)):
        reasons.append(f"payment received at unusual UTC hour {hour:02d}:xx")

    if features.is_round_amount:
        reasons.append(f"suspiciously round amount {features.amount:.2f}")

    is_anomaly = len(reasons) > 0
    score = min(1.0, len(reasons) * 0.33)

    return AnomalyResult(
        payment_id=features.payment_id,
        is_anomaly=is_anomaly,
        anomaly_score=score,
        reasons=reasons,
        review_required=is_anomaly,
    )


# ---------------------------------------------------------------------------
# Isolation Forest detector
# ---------------------------------------------------------------------------

class PaymentAnomalyDetector:
    """
    Trains IsolationForest on historical payment features for an org.
    Detects anomalies in new payments.
    """

    def __init__(self) -> None:
        self._model: Any | None = None
        self._trained = False

    def train(self, db: Any, org_id: str) -> bool:
        """Fit IsolationForest on historical payments for `org_id`."""
        if not (_SKLEARN_AVAILABLE and _NUMPY_AVAILABLE and _SQLA_AVAILABLE):
            logger.info("anomaly_detector: sklearn unavailable — rule-based mode")
            return False

        try:
            rows = db.execute(
                sqla_text(
                    """
                    SELECT
                        c.paid_amount,
                        COALESCE(
                            c.paid_amount / NULLIF(
                                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c2.paid_amount), 0
                            ), 1
                        ) AS ratio,
                        EXTRACT(EPOCH FROM (c.paid_at - LAG(c.paid_at) OVER (
                            PARTITION BY c.renter_id ORDER BY c.paid_at
                        ))) / 86400 AS days_since,
                        EXTRACT(HOUR FROM c.paid_at AT TIME ZONE 'UTC') AS hour_utc,
                        EXTRACT(DOW FROM c.paid_at) AS dow
                    FROM charges c
                    JOIN contracts con ON con.id = c.contract_id
                    JOIN charges c2 ON c2.renter_id = c.renter_id AND c2.status = 'paid'
                    WHERE con.tenant_id = :org_id
                      AND c.status = 'paid'
                      AND c.paid_amount IS NOT NULL
                    GROUP BY c.id, c.paid_amount, c.paid_at, c.renter_id
                    LIMIT 10000
                    """
                ),
                {"org_id": org_id},
            ).fetchall()

            if len(rows) < 50:
                logger.info("anomaly_detector: insufficient history (%d) for org=%s", len(rows), org_id)
                return False

            X = np.array([
                [float(r[0] or 0), float(r[1] or 1), float(r[2] or 30),
                 float(r[3] or 12), float(r[4] or 1), 0.0, 0.0]
                for r in rows
            ])

            model = IsolationForest(
                n_estimators=100,
                contamination=_IF_CONTAMINATION,
                random_state=42,
            )
            model.fit(X)
            self._model = model
            self._trained = True
            logger.info("anomaly_detector: trained IF on %d payments for org=%s", len(rows), org_id)
            return True

        except Exception as exc:
            logger.error("anomaly_detector: training failed: %s", exc)
            return False

    def detect(self, db: Any, payment_id: str) -> AnomalyResult:
        """Score a payment. Returns AnomalyResult (never raises)."""
        features = extract_payment_features(db, payment_id)
        if features is None:
            return AnomalyResult(
                payment_id=payment_id,
                is_anomaly=False,
                anomaly_score=0.0,
                reasons=["could_not_extract_features"],
            )

        # Try IsolationForest
        if self._trained and self._model is not None and _NUMPY_AVAILABLE:
            try:
                arr = np.array([features.to_array()])
                prediction = int(self._model.predict(arr)[0])   # -1 = anomaly, 1 = normal
                score_raw = float(self._model.score_samples(arr)[0])
                # Normalise: score_samples returns negative; more negative = more anomalous
                anomaly_score = max(0.0, min(1.0, (-score_raw - 0.3) / 0.4))
                is_anomaly = prediction == -1

                reasons: list[str] = []
                if features.amount_ratio > _AMOUNT_MULTIPLIER_THRESHOLD:
                    reasons.append(f"large amount (×{features.amount_ratio:.1f} median)")
                if features.is_new_payer_account:
                    reasons.append("new payer account")
                if features.is_round_amount:
                    reasons.append("round amount")

                return AnomalyResult(
                    payment_id=payment_id,
                    is_anomaly=is_anomaly,
                    anomaly_score=anomaly_score,
                    reasons=reasons,
                    review_required=is_anomaly,
                )
            except Exception as exc:
                logger.warning("anomaly_detector: IF scoring failed, using rules: %s", exc)

        return _rule_based_detect(features)

    def detect_and_store(self, db: Any, payment_id: str) -> AnomalyResult:
        """Detect anomaly and persist if flagged."""
        result = self.detect(db, payment_id)

        if result.is_anomaly and _SQLA_AVAILABLE:
            try:
                db.execute(
                    sqla_text(
                        """
                        INSERT INTO payment_anomalies
                            (payment_id, anomaly_score, reasons, review_required, detected_at)
                        VALUES (:pid, :score, :reasons::jsonb, :review, :ts)
                        ON CONFLICT (payment_id) DO UPDATE SET
                            anomaly_score = EXCLUDED.anomaly_score,
                            reasons = EXCLUDED.reasons,
                            review_required = EXCLUDED.review_required,
                            detected_at = EXCLUDED.detected_at
                        """
                    ),
                    {
                        "pid": result.payment_id,
                        "score": result.anomaly_score,
                        "reasons": __import__("json").dumps(result.reasons),
                        "review": result.review_required,
                        "ts": result.detected_at,
                    },
                )
                db.commit()
            except Exception as exc:
                logger.warning("anomaly_detector: failed to store anomaly: %s", exc)

        return result


# ---------------------------------------------------------------------------
# Module-level cache
# ---------------------------------------------------------------------------

_detector_cache: dict[str, PaymentAnomalyDetector] = {}


def get_detector(org_id: str) -> PaymentAnomalyDetector:
    """Return a cached PaymentAnomalyDetector for the given org."""
    if org_id not in _detector_cache:
        _detector_cache[org_id] = PaymentAnomalyDetector()
    return _detector_cache[org_id]
