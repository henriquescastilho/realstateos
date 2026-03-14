"""ReceitaWS / CPF / CNPJ validation integration.

Handles:
- CPF checksum validation (offline, no API required — used as fallback).
- CNPJ checksum validation (offline).
- Online validation via ReceitaWS API (https://www.receitaws.com.br/v1/cnpj/{cnpj}).
- Redis caching: valid CPF/CNPJ cached for 24h to reduce API calls.
- LGPD compliance: CPFs are masked in all log output (shows only first 3 + last 2 digits).
- Rate limiting awareness: ReceitaWS free tier allows ~3 req/min; client backs off.

LGPD note (Lei 13.709/2018):
- CPF is personal data — never log or store in plaintext.
- This module uses _mask_cpf() for all log statements.
- Cache keys use SHA-256 hash of the CPF, not the CPF itself.
- The caller is responsible for handling CPF data per their DPA.

Usage:
    validator = ReceitaValidator.from_env()

    # Validate CPF (offline checksum, optionally with online lookup)
    result = validator.validate_cpf("123.456.789-09")
    if result.valid:
        print("CPF OK")
    else:
        print(result.reason)

    # Validate CNPJ with Receita Federal data
    result = validator.validate_cnpj("11.222.333/0001-81")
    print(result.company_name, result.situation)
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
import time
from dataclasses import dataclass, field
from threading import Lock
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional dependencies
# ---------------------------------------------------------------------------

try:
    import httpx
    _HAS_HTTPX = True
except ImportError:
    _HAS_HTTPX = False

try:
    import redis as redis_lib
    _HAS_REDIS = True
except ImportError:
    _HAS_REDIS = False

try:
    from app.utils.resilience import retry_with_backoff
except ImportError:
    def retry_with_backoff(**kwargs):  # type: ignore[misc]
        def decorator(fn):
            return fn
        return decorator


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RECEITAWS_BASE_URL = "https://www.receitaws.com.br/v1"
CACHE_TTL_SECS = 86_400        # 24 hours
CACHE_KEY_PREFIX_CPF = "receita:cpf:"
CACHE_KEY_PREFIX_CNPJ = "receita:cnpj:"

# ReceitaWS free tier: ~3 requests/minute. We use a conservative 20s minimum gap.
_MIN_REQUEST_INTERVAL = 20.0   # seconds between CNPJ API calls

# Regex patterns (digits only after stripping)
_CPF_DIGITS = re.compile(r"^\d{11}$")
_CNPJ_DIGITS = re.compile(r"^\d{14}$")

# In-memory fallback cache: {hashed_key: (expires_at, data)}
_MEM_CACHE: dict[str, tuple[float, Any]] = {}
_MEM_CACHE_LOCK = Lock()

# Rate limiter state
_LAST_CNPJ_REQUEST: float = 0.0
_RATE_LOCK = Lock()


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class CPFResult:
    """Result of a CPF validation."""

    valid: bool
    reason: str = ""
    source: str = "checksum"   # "checksum" | "cache" | "api"


@dataclass
class CNPJResult:
    """Result of a CNPJ validation, optionally enriched with Receita Federal data."""

    valid: bool
    reason: str = ""
    source: str = "checksum"   # "checksum" | "cache" | "api"
    cnpj: str = ""              # Normalised 14-digit string
    company_name: str = ""
    trading_name: str = ""
    situation: str = ""         # "ATIVA" | "BAIXADA" | "INAPTA" | ...
    opening_date: str = ""
    company_type: str = ""
    address: dict = field(default_factory=dict)
    activities: list[dict] = field(default_factory=list)
    raw: dict = field(default_factory=dict, repr=False)

    @property
    def is_active(self) -> bool:
        return self.situation.upper() == "ATIVA"


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class ReceitaAPIError(RuntimeError):
    """Raised when the ReceitaWS API returns an unexpected error."""


class ReceitaRateLimitError(RuntimeError):
    """Raised when the ReceitaWS rate limit is hit."""


# ---------------------------------------------------------------------------
# LGPD-compliant masking
# ---------------------------------------------------------------------------

def _mask_cpf(cpf: str) -> str:
    """Mask CPF for safe logging: '123.456.789-09' → '123.***.***-09'."""
    digits = re.sub(r"[^\d]", "", cpf)
    if len(digits) >= 5:
        return f"{digits[:3]}.***.**{digits[-2:]}"
    return "***.***.***-**"


def _mask_cnpj(cnpj: str) -> str:
    """Mask CNPJ for logging: '11.222.333/0001-81' → '11.222.***/**-81'."""
    digits = re.sub(r"[^\d]", "", cnpj)
    if len(digits) >= 4:
        return f"{digits[:2]}.***.***/***-{digits[-2:]}"
    return "**.***.***/****-**"


def _cache_key_cpf(digits: str) -> str:
    """Return a SHA-256 derived cache key (LGPD: do not store CPF in plaintext)."""
    h = hashlib.sha256(digits.encode()).hexdigest()[:24]
    return f"{CACHE_KEY_PREFIX_CPF}{h}"


def _cache_key_cnpj(digits: str) -> str:
    h = hashlib.sha256(digits.encode()).hexdigest()[:24]
    return f"{CACHE_KEY_PREFIX_CNPJ}{h}"


# ---------------------------------------------------------------------------
# CPF checksum validation (offline)
# ---------------------------------------------------------------------------

def _normalise_cpf(cpf: str) -> str:
    """Strip mask and validate digit count."""
    digits = re.sub(r"[^\d]", "", cpf)
    if not _CPF_DIGITS.match(digits):
        raise ValueError(f"CPF deve ter 11 dígitos. Recebido: {_mask_cpf(cpf)}")
    return digits


def _cpf_checksum_valid(digits: str) -> bool:
    """Validate CPF using the Brazilian digit-verification algorithm."""
    # Reject all-same-digit sequences (e.g. 111.111.111-11)
    if len(set(digits)) == 1:
        return False

    # First check digit
    total = sum(int(digits[i]) * (10 - i) for i in range(9))
    remainder = (total * 10) % 11
    if remainder == 10:
        remainder = 0
    if remainder != int(digits[9]):
        return False

    # Second check digit
    total = sum(int(digits[i]) * (11 - i) for i in range(10))
    remainder = (total * 10) % 11
    if remainder == 10:
        remainder = 0
    return remainder == int(digits[10])


# ---------------------------------------------------------------------------
# CNPJ checksum validation (offline)
# ---------------------------------------------------------------------------

def _normalise_cnpj(cnpj: str) -> str:
    digits = re.sub(r"[^\d]", "", cnpj)
    if not _CNPJ_DIGITS.match(digits):
        raise ValueError(f"CNPJ deve ter 14 dígitos. Recebido: {_mask_cnpj(cnpj)}")
    return digits


def _cnpj_checksum_valid(digits: str) -> bool:
    """Validate CNPJ using the Brazilian digit-verification algorithm."""
    if len(set(digits)) == 1:
        return False

    def _calc(d: str, weights: list[int]) -> int:
        total = sum(int(d[i]) * weights[i] for i in range(len(weights)))
        remainder = total % 11
        return 0 if remainder < 2 else 11 - remainder

    weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

    check1 = _calc(digits, weights1)
    check2 = _calc(digits, weights2)

    return int(digits[12]) == check1 and int(digits[13]) == check2


# ---------------------------------------------------------------------------
# In-memory cache helpers
# ---------------------------------------------------------------------------

def _mem_get(key: str) -> Any:
    with _MEM_CACHE_LOCK:
        entry = _MEM_CACHE.get(key)
        if entry is None:
            return None
        expires_at, data = entry
        if time.time() > expires_at:
            del _MEM_CACHE[key]
            return None
        return data


def _mem_set(key: str, data: Any, ttl: int = CACHE_TTL_SECS) -> None:
    with _MEM_CACHE_LOCK:
        _MEM_CACHE[key] = (time.time() + ttl, data)


# ---------------------------------------------------------------------------
# ReceitaValidator
# ---------------------------------------------------------------------------

class ReceitaValidator:
    """CPF and CNPJ validator.

    CPF: offline checksum validation only (ReceitaWS does not provide CPF lookup).
    CNPJ: offline checksum + optional online enrichment via ReceitaWS API.

    Thread-safe. Uses Redis (preferred) or in-memory for caching.
    LGPD-compliant: CPFs never appear in log output or cache keys.
    """

    def __init__(
        self,
        redis_url: str | None = None,
        cache_ttl: int = CACHE_TTL_SECS,
        online_cnpj: bool = True,
        timeout: float = 10.0,
    ) -> None:
        self.cache_ttl = cache_ttl
        self.online_cnpj = online_cnpj
        self.timeout = timeout
        self._redis: Any = None

        if _HAS_REDIS and redis_url:
            try:
                self._redis = redis_lib.from_url(redis_url, decode_responses=True)
                self._redis.ping()
            except Exception as exc:
                logger.warning("ReceitaValidator: Redis unavailable (%s) — using in-memory cache", exc)
                self._redis = None

    @classmethod
    def from_env(cls) -> "ReceitaValidator":
        """Construct from environment variables.

        Optional:
            REDIS_URL                     Redis for distributed caching
            RECEITA_ONLINE_CNPJ=false     Disable online CNPJ lookup (default: true)
            RECEITA_TIMEOUT               HTTP timeout in seconds (default: 10.0)
        """
        return cls(
            redis_url=os.environ.get("REDIS_URL"),
            online_cnpj=os.environ.get("RECEITA_ONLINE_CNPJ", "true").lower() == "true",
            timeout=float(os.environ.get("RECEITA_TIMEOUT", "10.0")),
        )

    # ------------------------------------------------------------------
    # CPF validation
    # ------------------------------------------------------------------

    def validate_cpf(self, cpf: str) -> CPFResult:
        """Validate a CPF using offline checksum.

        Args:
            cpf: CPF in any format (with or without mask).

        Returns:
            CPFResult with valid flag and reason.
        """
        try:
            digits = _normalise_cpf(cpf)
        except ValueError as exc:
            return CPFResult(valid=False, reason=str(exc), source="checksum")

        # Check cache (keyed by hash — LGPD)
        cache_key = _cache_key_cpf(digits)
        cached = self._cache_get(cache_key)
        if cached is not None:
            logger.debug("receita.cpf.cache_hit masked=%s", _mask_cpf(cpf))
            return CPFResult(valid=cached["valid"], reason=cached.get("reason", ""), source="cache")

        valid = _cpf_checksum_valid(digits)
        reason = "" if valid else "CPF inválido: dígitos verificadores incorretos."
        logger.info(
            "receita.cpf.checksum masked=%s valid=%s",
            _mask_cpf(cpf), valid,
        )

        self._cache_set(cache_key, {"valid": valid, "reason": reason})
        return CPFResult(valid=valid, reason=reason, source="checksum")

    # ------------------------------------------------------------------
    # CNPJ validation
    # ------------------------------------------------------------------

    def validate_cnpj(self, cnpj: str, fetch_details: bool = True) -> CNPJResult:
        """Validate a CNPJ and optionally fetch company details from ReceitaWS.

        Args:
            cnpj: CNPJ in any format.
            fetch_details: If True and online_cnpj=True, call ReceitaWS API
                           for company name, situation, etc.

        Returns:
            CNPJResult with valid flag, and optionally enriched company data.
        """
        try:
            digits = _normalise_cnpj(cnpj)
        except ValueError as exc:
            return CNPJResult(valid=False, reason=str(exc), source="checksum")

        # Check cache
        cache_key = _cache_key_cnpj(digits)
        cached = self._cache_get(cache_key)
        if cached is not None:
            logger.debug("receita.cnpj.cache_hit masked=%s", _mask_cnpj(cnpj))
            return _dict_to_cnpj_result(cached, source="cache")

        # Offline checksum
        checksum_ok = _cnpj_checksum_valid(digits)
        if not checksum_ok:
            result = CNPJResult(
                valid=False,
                reason="CNPJ inválido: dígitos verificadores incorretos.",
                source="checksum",
                cnpj=digits,
            )
            self._cache_set(cache_key, _cnpj_result_to_dict(result))
            return result

        # If online lookup disabled or not requested
        if not self.online_cnpj or not fetch_details:
            logger.info(
                "receita.cnpj.checksum_ok masked=%s (online disabled)",
                _mask_cnpj(cnpj),
            )
            result = CNPJResult(
                valid=True,
                reason="",
                source="checksum",
                cnpj=digits,
            )
            self._cache_set(cache_key, _cnpj_result_to_dict(result))
            return result

        # Online lookup via ReceitaWS
        try:
            data = self._fetch_cnpj(digits)
        except ReceitaRateLimitError:
            logger.warning(
                "receita.cnpj.rate_limited masked=%s — returning checksum-only result",
                _mask_cnpj(cnpj),
            )
            return CNPJResult(
                valid=True,
                reason="Checksum válido (API indisponível — rate limit)",
                source="checksum",
                cnpj=digits,
            )
        except Exception as exc:
            logger.warning(
                "receita.cnpj.api_error masked=%s error=%s — returning checksum-only",
                _mask_cnpj(cnpj), exc,
            )
            return CNPJResult(
                valid=True,
                reason="Checksum válido (API indisponível)",
                source="checksum",
                cnpj=digits,
            )

        result = _map_receitaws_response(data, digits)
        self._cache_set(cache_key, _cnpj_result_to_dict(result))
        logger.info(
            "receita.cnpj.api_ok masked=%s situation=%s company=%s",
            _mask_cnpj(cnpj),
            result.situation,
            result.company_name[:40] if result.company_name else "",
        )
        return result

    # ------------------------------------------------------------------
    # ReceitaWS API call
    # ------------------------------------------------------------------

    @retry_with_backoff(max_attempts=2, base_delay=5.0, exceptions=(ReceitaAPIError,))
    def _fetch_cnpj(self, digits: str) -> dict:
        """Call ReceitaWS and return the raw response dict."""
        if not _HAS_HTTPX:
            raise ReceitaAPIError("httpx not installed — cannot perform online CNPJ lookup")

        # Simple rate limiting: ensure minimum gap between requests
        global _LAST_CNPJ_REQUEST
        with _RATE_LOCK:
            now = time.monotonic()
            elapsed = now - _LAST_CNPJ_REQUEST
            if elapsed < _MIN_REQUEST_INTERVAL:
                wait = _MIN_REQUEST_INTERVAL - elapsed
                logger.debug("receita.rate_limit waiting=%.1fs", wait)
                time.sleep(wait)
            _LAST_CNPJ_REQUEST = time.monotonic()

        url = f"{RECEITAWS_BASE_URL}/cnpj/{digits}"
        try:
            with httpx.Client(timeout=self.timeout) as http:
                response = http.get(url, headers={"Accept": "application/json"})

                if response.status_code == 429:
                    raise ReceitaRateLimitError("ReceitaWS rate limit hit (429)")

                response.raise_for_status()
                return response.json()

        except ReceitaRateLimitError:
            raise
        except httpx.HTTPStatusError as exc:
            raise ReceitaAPIError(
                f"ReceitaWS API error ({exc.response.status_code}): {exc.response.text[:200]}"
            ) from exc
        except httpx.RequestError as exc:
            raise ReceitaAPIError(f"ReceitaWS network error: {exc}") from exc

    # ------------------------------------------------------------------
    # Cache helpers
    # ------------------------------------------------------------------

    def _cache_get(self, key: str) -> dict | None:
        if self._redis is not None:
            try:
                import json as _json
                raw = self._redis.get(key)
                return _json.loads(raw) if raw else None
            except Exception as exc:
                logger.warning("Receita cache get error: %s", exc)
        return _mem_get(key)

    def _cache_set(self, key: str, data: dict) -> None:
        if self._redis is not None:
            try:
                import json as _json
                self._redis.setex(key, self.cache_ttl, _json.dumps(data, ensure_ascii=False))
                return
            except Exception as exc:
                logger.warning("Receita cache set error: %s", exc)
        _mem_set(key, data, self.cache_ttl)


# ---------------------------------------------------------------------------
# Mapping helpers
# ---------------------------------------------------------------------------

def _map_receitaws_response(data: dict, digits: str) -> CNPJResult:
    """Map ReceitaWS response to CNPJResult."""
    status = data.get("status", "")
    message = data.get("message", "")

    # ReceitaWS returns {"status": "ERROR", "message": "CNPJ invalido"}
    if status == "ERROR":
        return CNPJResult(
            valid=False,
            reason=f"ReceitaWS: {message}",
            source="api",
            cnpj=digits,
            raw=data,
        )

    situation = data.get("situacao", "").upper()
    valid = situation == "ATIVA"
    reason = "" if valid else f"CNPJ {situation.lower() or 'inativo'}"

    # Address
    address = {
        "logradouro": data.get("logradouro", ""),
        "numero": data.get("numero", ""),
        "complemento": data.get("complemento", ""),
        "bairro": data.get("bairro", ""),
        "municipio": data.get("municipio", ""),
        "uf": data.get("uf", ""),
        "cep": data.get("cep", ""),
    }

    # Activities
    activities: list[dict] = []
    for act in data.get("atividades_secundarias", []):
        activities.append({"code": act.get("code", ""), "text": act.get("text", "")})
    primary = data.get("atividade_principal", [])
    if primary:
        activities.insert(0, {"code": primary[0].get("code", ""), "text": primary[0].get("text", ""), "primary": True})

    return CNPJResult(
        valid=valid,
        reason=reason,
        source="api",
        cnpj=digits,
        company_name=data.get("nome", ""),
        trading_name=data.get("fantasia", ""),
        situation=situation,
        opening_date=data.get("abertura", ""),
        company_type=data.get("tipo", ""),
        address=address,
        activities=activities,
        raw=data,
    )


def _cnpj_result_to_dict(result: CNPJResult) -> dict:
    """Serialise CNPJResult to a dict for caching (exclude raw to save space)."""
    return {
        "valid": result.valid,
        "reason": result.reason,
        "source": result.source,
        "cnpj": result.cnpj,
        "company_name": result.company_name,
        "trading_name": result.trading_name,
        "situation": result.situation,
        "opening_date": result.opening_date,
        "company_type": result.company_type,
        "address": result.address,
        "activities": result.activities,
    }


def _dict_to_cnpj_result(data: dict, source: str = "cache") -> CNPJResult:
    return CNPJResult(
        valid=data.get("valid", False),
        reason=data.get("reason", ""),
        source=source,
        cnpj=data.get("cnpj", ""),
        company_name=data.get("company_name", ""),
        trading_name=data.get("trading_name", ""),
        situation=data.get("situation", ""),
        opening_date=data.get("opening_date", ""),
        company_type=data.get("company_type", ""),
        address=data.get("address", {}),
        activities=data.get("activities", []),
    )


# ---------------------------------------------------------------------------
# Module-level singleton + convenience functions
# ---------------------------------------------------------------------------

_default_validator: ReceitaValidator | None = None
_singleton_lock = Lock()


def get_receita_validator() -> ReceitaValidator:
    """Return module-level ReceitaValidator singleton, initialised from env vars."""
    global _default_validator
    if _default_validator is None:
        with _singleton_lock:
            if _default_validator is None:
                _default_validator = ReceitaValidator.from_env()
    return _default_validator


def validate_cpf(cpf: str) -> CPFResult:
    """Convenience wrapper: validate CPF using the module singleton."""
    return get_receita_validator().validate_cpf(cpf)


def validate_cnpj(cnpj: str, fetch_details: bool = True) -> CNPJResult:
    """Convenience wrapper: validate CNPJ using the module singleton."""
    return get_receita_validator().validate_cnpj(cnpj, fetch_details=fetch_details)


def is_valid_cpf(cpf: str) -> bool:
    """Return True if CPF passes checksum validation."""
    return validate_cpf(cpf).valid


def is_valid_cnpj(cnpj: str) -> bool:
    """Return True if CNPJ passes checksum validation (no online lookup)."""
    return validate_cnpj(cnpj, fetch_details=False).valid
