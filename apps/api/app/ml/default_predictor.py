"""Predictive default scoring — feature engineering + LogisticRegression per renter.

Scores are computed monthly and stored in the `renter_default_scores` table.
The model trains on historical payment behaviour (days late, partial payments,
maintenance correlation) and outputs a default probability [0.0, 1.0].

Optional dependencies:
    scikit-learn  — LogisticRegression, StandardScaler, train/test utilities
    sqlalchemy    — async DB access
    numpy         — feature array construction

If scikit-learn is unavailable the module degrades to a rule-based heuristic
(weighted average of normalised feature values) so the billing engine always
gets a score.
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
    from sklearn.linear_model import LogisticRegression  # type: ignore
    from sklearn.preprocessing import StandardScaler  # type: ignore
    _SKLEARN_AVAILABLE = True
except ImportError:
    _SKLEARN_AVAILABLE = False

try:
    from sqlalchemy import text as sqla_text  # type: ignore
    _SQLA_AVAILABLE = True
except ImportError:
    _SQLA_AVAILABLE = False

# ---------------------------------------------------------------------------
# Feature names (order matters — must match training array columns)
# ---------------------------------------------------------------------------
FEATURE_NAMES = [
    "avg_days_late",          # Mean days late across all payments (0 = on-time)
    "max_days_late",          # Worst single payment delay
    "partial_payment_rate",   # Fraction of payments that were partial (< full amount)
    "late_payment_rate",      # Fraction of payments that were late
    "payment_count",          # Total payments (proxy for history length)
    "maintenance_ticket_count",  # Maintenance tickets filed (stress indicator)
    "months_as_renter",       # Seniority (longer → generally better risk)
]

# Heuristic weights for rule-based fallback (must sum to 1.0)
_HEURISTIC_WEIGHTS = {
    "avg_days_late": 0.30,
    "max_days_late": 0.15,
    "partial_payment_rate": 0.20,
    "late_payment_rate": 0.20,
    "payment_count": -0.05,       # negative: more history = lower risk
    "maintenance_ticket_count": 0.10,
    "months_as_renter": -0.00,    # neutral — long term renters not penalised
}

# Normalisation caps for heuristic (avoid unbounded scores)
_NORMALISE_CAPS = {
    "avg_days_late": 30.0,
    "max_days_late": 90.0,
    "partial_payment_rate": 1.0,
    "late_payment_rate": 1.0,
    "payment_count": 60.0,
    "maintenance_ticket_count": 10.0,
    "months_as_renter": 60.0,
}

# Risk labels
RISK_LOW = "low"       # < 0.20
RISK_MEDIUM = "medium" # 0.20 – 0.50
RISK_HIGH = "high"     # > 0.50


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class RenterFeatures:
    renter_id: str
    avg_days_late: float = 0.0
    max_days_late: float = 0.0
    partial_payment_rate: float = 0.0
    late_payment_rate: float = 0.0
    payment_count: int = 0
    maintenance_ticket_count: int = 0
    months_as_renter: int = 0

    def to_array(self) -> list[float]:
        return [
            self.avg_days_late,
            self.max_days_late,
            self.partial_payment_rate,
            self.late_payment_rate,
            float(self.payment_count),
            float(self.maintenance_ticket_count),
            float(self.months_as_renter),
        ]


@dataclass
class DefaultScore:
    renter_id: str
    probability: float           # [0.0, 1.0]
    risk_label: str              # low | medium | high
    scored_at: datetime = field(default_factory=lambda: datetime.now(tz=timezone.utc))
    model_version: str = "heuristic-v1"
    features: dict[str, float] = field(default_factory=dict)

    @property
    def is_high_risk(self) -> bool:
        return self.probability > 0.50


# ---------------------------------------------------------------------------
# Feature extraction
# ---------------------------------------------------------------------------

def extract_features(db: Any, renter_id: str, lookback_months: int = 12) -> RenterFeatures:
    """
    Query payment and maintenance history for a renter and compute features.

    Falls back to zero-features (no-history) if DB unavailable or renter not found.
    """
    if not _SQLA_AVAILABLE:
        return RenterFeatures(renter_id=renter_id)

    features = RenterFeatures(renter_id=renter_id)

    try:
        # Payment history features
        row = db.execute(
            sqla_text(
                """
                SELECT
                    COALESCE(AVG(GREATEST(EXTRACT(EPOCH FROM (paid_at - due_date)) / 86400, 0)), 0)
                        AS avg_days_late,
                    COALESCE(MAX(GREATEST(EXTRACT(EPOCH FROM (paid_at - due_date)) / 86400, 0)), 0)
                        AS max_days_late,
                    COALESCE(
                        SUM(CASE WHEN paid_amount < amount THEN 1 ELSE 0 END)::float
                        / NULLIF(COUNT(*), 0), 0
                    ) AS partial_payment_rate,
                    COALESCE(
                        SUM(CASE WHEN paid_at > due_date THEN 1 ELSE 0 END)::float
                        / NULLIF(COUNT(*), 0), 0
                    ) AS late_payment_rate,
                    COUNT(*) AS payment_count
                FROM charges
                WHERE renter_id = :rid
                  AND status IN ('paid', 'partial')
                  AND due_date >= NOW() - INTERVAL ':months months'
                """
            ),
            {"rid": renter_id, "months": lookback_months},
        ).fetchone()

        if row:
            features.avg_days_late = float(row[0] or 0)
            features.max_days_late = float(row[1] or 0)
            features.partial_payment_rate = float(row[2] or 0)
            features.late_payment_rate = float(row[3] or 0)
            features.payment_count = int(row[4] or 0)

        # Maintenance ticket count
        mrow = db.execute(
            sqla_text(
                """
                SELECT COUNT(*) FROM tasks
                WHERE renter_id = :rid
                  AND type = 'maintenance'
                  AND created_at >= NOW() - INTERVAL ':months months'
                """
            ),
            {"rid": renter_id, "months": lookback_months},
        ).fetchone()
        features.maintenance_ticket_count = int(mrow[0] or 0) if mrow else 0

        # Months as renter
        since_row = db.execute(
            sqla_text(
                """
                SELECT EXTRACT(MONTH FROM AGE(NOW(), MIN(start_date)))
                FROM contracts
                WHERE renter_id = :rid AND status != 'cancelled'
                """
            ),
            {"rid": renter_id},
        ).fetchone()
        features.months_as_renter = int(since_row[0] or 0) if since_row else 0

    except Exception as exc:
        logger.warning("default_predictor: feature extraction failed renter=%s: %s", renter_id, exc)

    return features


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def _heuristic_score(features: RenterFeatures) -> float:
    """Rule-based score when sklearn is unavailable."""
    score = 0.0
    arr = {name: val for name, val in zip(FEATURE_NAMES, features.to_array())}
    for name, weight in _HEURISTIC_WEIGHTS.items():
        cap = _NORMALISE_CAPS[name]
        norm = min(arr.get(name, 0.0) / cap, 1.0) if cap > 0 else 0.0
        score += weight * norm
    # Clamp to [0, 1]
    return max(0.0, min(1.0, score))


def _risk_label(probability: float) -> str:
    if probability < 0.20:
        return RISK_LOW
    if probability <= 0.50:
        return RISK_MEDIUM
    return RISK_HIGH


class DefaultPredictor:
    """
    Trains on historical data and scores individual renters.

    Usage:
        predictor = DefaultPredictor()
        predictor.train(db, org_id)          # fit model on org's history
        score = predictor.score(db, renter_id)
        predictor.score_all_and_store(db, org_id)  # batch monthly job
    """

    def __init__(self) -> None:
        self._model: Any | None = None
        self._scaler: Any | None = None
        self._model_version = "heuristic-v1"

    # ------------------------------------------------------------------
    # Training
    # ------------------------------------------------------------------

    def train(self, db: Any, org_id: str) -> bool:
        """
        Train LogisticRegression on historical payment data for `org_id`.

        Returns True on success, False when sklearn/numpy unavailable or
        there is insufficient training data (< 20 samples).
        """
        if not (_SKLEARN_AVAILABLE and _NUMPY_AVAILABLE and _SQLA_AVAILABLE):
            logger.info("default_predictor: sklearn/numpy unavailable — heuristic mode")
            return False

        try:
            rows = db.execute(
                sqla_text(
                    """
                    SELECT
                        r.id AS renter_id,
                        COALESCE(AVG(GREATEST(EXTRACT(EPOCH FROM (c.paid_at - c.due_date)) / 86400, 0)), 0) AS avg_days_late,
                        COALESCE(MAX(GREATEST(EXTRACT(EPOCH FROM (c.paid_at - c.due_date)) / 86400, 0)), 0) AS max_days_late,
                        COALESCE(SUM(CASE WHEN c.paid_amount < c.amount THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0), 0) AS partial_rate,
                        COALESCE(SUM(CASE WHEN c.paid_at > c.due_date THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0), 0) AS late_rate,
                        COUNT(c.id) AS payment_count,
                        COUNT(DISTINCT t.id) AS ticket_count,
                        EXTRACT(MONTH FROM AGE(NOW(), MIN(con.start_date))) AS months_renter,
                        -- Label: 1 if renter ever had 3+ late payments or any payment > 30 days late
                        CASE WHEN
                            SUM(CASE WHEN c.paid_at > c.due_date THEN 1 ELSE 0 END) >= 3
                            OR MAX(GREATEST(EXTRACT(EPOCH FROM (c.paid_at - c.due_date)) / 86400, 0)) > 30
                        THEN 1 ELSE 0 END AS defaulted
                    FROM tenants_renters r
                    JOIN contracts con ON con.renter_id = r.id
                    LEFT JOIN charges c ON c.renter_id = r.id AND c.status IN ('paid', 'partial')
                    LEFT JOIN tasks t ON t.renter_id = r.id AND t.type = 'maintenance'
                    WHERE r.tenant_id = :org_id
                    GROUP BY r.id
                    HAVING COUNT(c.id) >= 3
                    """
                ),
                {"org_id": org_id},
            ).fetchall()

            if len(rows) < 20:
                logger.info(
                    "default_predictor: only %d training samples for org=%s — heuristic mode",
                    len(rows), org_id,
                )
                return False

            X = np.array([[float(r[1]), float(r[2]), float(r[3]), float(r[4]),
                           float(r[5]), float(r[6]), float(r[7])] for r in rows])
            y = np.array([int(r[8]) for r in rows])

            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)

            model = LogisticRegression(max_iter=500, class_weight="balanced")
            model.fit(X_scaled, y)

            self._model = model
            self._scaler = scaler
            self._model_version = "logreg-v1"
            logger.info("default_predictor: trained on %d samples for org=%s", len(rows), org_id)
            return True

        except Exception as exc:
            logger.error("default_predictor: training failed: %s", exc)
            return False

    # ------------------------------------------------------------------
    # Scoring
    # ------------------------------------------------------------------

    def score(self, db: Any, renter_id: str) -> DefaultScore:
        """Score a single renter. Falls back to heuristic if model not trained."""
        features = extract_features(db, renter_id)

        if self._model is not None and self._scaler is not None and _NUMPY_AVAILABLE:
            try:
                arr = np.array([features.to_array()])
                arr_scaled = self._scaler.transform(arr)
                prob = float(self._model.predict_proba(arr_scaled)[0][1])
                return DefaultScore(
                    renter_id=renter_id,
                    probability=prob,
                    risk_label=_risk_label(prob),
                    model_version=self._model_version,
                    features=dict(zip(FEATURE_NAMES, features.to_array())),
                )
            except Exception as exc:
                logger.warning("default_predictor: model scoring failed, using heuristic: %s", exc)

        # Heuristic fallback
        prob = _heuristic_score(features)
        return DefaultScore(
            renter_id=renter_id,
            probability=prob,
            risk_label=_risk_label(prob),
            model_version="heuristic-v1",
            features=dict(zip(FEATURE_NAMES, features.to_array())),
        )

    def score_all_and_store(self, db: Any, org_id: str) -> int:
        """
        Score all active renters for `org_id` and persist results to DB.

        Returns the count of scores written.
        """
        if not _SQLA_AVAILABLE:
            return 0

        try:
            renter_rows = db.execute(
                sqla_text(
                    "SELECT id FROM tenants_renters WHERE tenant_id = :org_id AND deleted_at IS NULL"
                ),
                {"org_id": org_id},
            ).fetchall()
        except Exception as exc:
            logger.error("default_predictor: failed to fetch renters: %s", exc)
            return 0

        count = 0
        for (renter_id,) in renter_rows:
            ds = self.score(db, str(renter_id))
            try:
                db.execute(
                    sqla_text(
                        """
                        INSERT INTO renter_default_scores
                            (renter_id, probability, risk_label, model_version, features, scored_at)
                        VALUES
                            (:rid, :prob, :risk, :mv, :feat::jsonb, :ts)
                        ON CONFLICT (renter_id)
                        DO UPDATE SET
                            probability = EXCLUDED.probability,
                            risk_label = EXCLUDED.risk_label,
                            model_version = EXCLUDED.model_version,
                            features = EXCLUDED.features,
                            scored_at = EXCLUDED.scored_at
                        """
                    ),
                    {
                        "rid": ds.renter_id,
                        "prob": ds.probability,
                        "risk": ds.risk_label,
                        "mv": ds.model_version,
                        "feat": __import__("json").dumps(ds.features),
                        "ts": ds.scored_at,
                    },
                )
                count += 1
            except Exception as exc:
                logger.warning("default_predictor: failed to store score renter=%s: %s", renter_id, exc)

        try:
            db.commit()
        except Exception:
            pass

        logger.info("default_predictor: scored %d renters for org=%s", count, org_id)
        return count


# ---------------------------------------------------------------------------
# Module-level convenience
# ---------------------------------------------------------------------------

_predictor_cache: dict[str, DefaultPredictor] = {}


def get_predictor(org_id: str) -> DefaultPredictor:
    """Return a cached DefaultPredictor for the given org."""
    if org_id not in _predictor_cache:
        _predictor_cache[org_id] = DefaultPredictor()
    return _predictor_cache[org_id]
