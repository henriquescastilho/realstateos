"""ViaCEP address lookup integration.

Handles:
- CEP (Brazilian postal code) lookup via the public ViaCEP API.
- Redis caching with 24h TTL to avoid redundant API calls.
- Fallback: returns None (caller prompts for manual entry) on API failure.
- State/city consistency validation against known BR state codes.
- CEP normalisation: strips mask (e.g. "01310-100" → "01310100").
- Retry on transient errors; no circuit breaker needed (public, unauthenticated API).

Usage:
    client = ViaCEPClient.from_env()

    address = client.lookup("01310-100")
    if address is None:
        # API unavailable — prompt user to fill address manually
        ...
    else:
        print(address.logradouro, address.cidade, address.estado)

    # Validate that a city/state pair is consistent with what ViaCEP returned
    ok, msg = client.validate_city_state("São Paulo", "SP", address)
"""
from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
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
    logger.warning("httpx not installed — ViaCEPClient will always return None (fallback)")

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

VIACEP_BASE_URL = "https://viacep.com.br/ws"
CACHE_TTL_SECS = 86_400        # 24 hours
CACHE_KEY_PREFIX = "viacep:"
CEP_PATTERN = re.compile(r"^\d{8}$")

# Canonical BR state codes (ISO 3166-2:BR)
BR_STATE_CODES = frozenset({
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO",
    "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
    "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
})

# In-memory cache fallback (used when Redis is unavailable)
_MEM_CACHE: dict[str, dict | None] = {}
_MEM_CACHE_LOCK = Lock()


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class Address:
    """Normalised Brazilian address from ViaCEP."""

    cep: str            # "01310100" (8 digits, no mask)
    logradouro: str     # Street name
    complemento: str    # Complement (e.g. "apto 12")
    bairro: str         # Neighbourhood
    cidade: str         # City (municipio)
    estado: str         # 2-letter state code (UF)
    ibge: str           # IBGE city code (7 digits)
    ddd: str            # Area code

    @property
    def formatted_cep(self) -> str:
        """Return CEP with mask: "01310-100"."""
        return f"{self.cep[:5]}-{self.cep[5:]}" if len(self.cep) == 8 else self.cep

    @property
    def full_address(self) -> str:
        """One-line address for display."""
        parts = [self.logradouro, self.bairro, self.cidade, self.estado]
        return ", ".join(p for p in parts if p)

    def to_dict(self) -> dict:
        return {
            "cep": self.cep,
            "logradouro": self.logradouro,
            "complemento": self.complemento,
            "bairro": self.bairro,
            "cidade": self.cidade,
            "estado": self.estado,
            "ibge": self.ibge,
            "ddd": self.ddd,
        }


class ViaCEPNotFoundError(ValueError):
    """Raised when ViaCEP returns a valid response but the CEP does not exist."""


class ViaCEPInvalidError(ValueError):
    """Raised when the CEP string is malformed."""


# ---------------------------------------------------------------------------
# ViaCEPClient
# ---------------------------------------------------------------------------

class ViaCEPClient:
    """CEP lookup client using the public ViaCEP API.

    Thread-safe. Caches results in Redis (preferred) or in-memory fallback.
    Returns None on any network/API failure — callers must handle manual entry.
    """

    def __init__(
        self,
        redis_url: str | None = None,
        cache_ttl: int = CACHE_TTL_SECS,
        timeout: float = 5.0,
    ) -> None:
        self.cache_ttl = cache_ttl
        self.timeout = timeout
        self._redis: Any = None

        if _HAS_REDIS and redis_url:
            try:
                self._redis = redis_lib.from_url(redis_url, decode_responses=True)
                self._redis.ping()
                logger.debug("ViaCEPClient: Redis cache connected")
            except Exception as exc:
                logger.warning("ViaCEPClient: Redis unavailable (%s) — using in-memory cache", exc)
                self._redis = None

    @classmethod
    def from_env(cls) -> "ViaCEPClient":
        """Construct from environment variables.

        Optional:
            REDIS_URL                Redis for distributed caching
            VIACEP_CACHE_TTL         Override TTL in seconds (default: 86400)
            VIACEP_TIMEOUT           HTTP timeout in seconds (default: 5.0)
        """
        return cls(
            redis_url=os.environ.get("REDIS_URL"),
            cache_ttl=int(os.environ.get("VIACEP_CACHE_TTL", str(CACHE_TTL_SECS))),
            timeout=float(os.environ.get("VIACEP_TIMEOUT", "5.0")),
        )

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def lookup(self, cep: str) -> Address | None:
        """Lookup a CEP and return a normalised Address.

        Args:
            cep: Postal code in any format: "01310100" or "01310-100".

        Returns:
            Address on success, None on network failure or API unavailability.

        Raises:
            ViaCEPInvalidError: CEP is not 8 digits.
            ViaCEPNotFoundError: CEP is valid but does not exist in ViaCEP.
        """
        normalised = _normalise_cep(cep)

        # 1. Check cache
        cached = self._cache_get(normalised)
        if cached is not None:
            logger.debug("viacep.cache_hit cep=%s", normalised)
            return _dict_to_address(cached)

        # 2. Call ViaCEP API
        try:
            data = self._fetch(normalised)
        except (ViaCEPInvalidError, ViaCEPNotFoundError):
            raise
        except Exception as exc:
            logger.warning("viacep.fetch_error cep=%s error=%s — returning None", normalised, exc)
            return None

        if data is None:
            return None

        address = _dict_to_address(data)
        self._cache_set(normalised, data)
        logger.info(
            "viacep.lookup_ok cep=%s cidade=%s estado=%s",
            normalised, address.cidade, address.estado,
        )
        return address

    def validate_city_state(
        self,
        city: str,
        state: str,
        address: Address | None,
    ) -> tuple[bool, str]:
        """Validate that city/state pair is consistent with a looked-up address.

        Args:
            city: City name provided by the user.
            state: 2-letter state code provided by the user.
            address: Address from lookup() (may be None if lookup failed).

        Returns:
            (True, "") if consistent, or (False, "<reason>") if not.
        """
        state_upper = state.upper().strip()

        # Validate state code format
        if state_upper not in BR_STATE_CODES:
            return False, f"Estado inválido: {state!r}. Use o código de 2 letras (ex: SP, RJ)."

        if address is None:
            # No lookup result — accept whatever the user typed (manual entry)
            return True, ""

        # Compare state
        if address.estado.upper() != state_upper:
            return (
                False,
                f"Estado inconsistente: CEP {address.formatted_cep} pertence a "
                f"{address.estado}, não {state_upper}.",
            )

        # Compare city (normalised)
        if city and _normalise_text(city) != _normalise_text(address.cidade):
            return (
                False,
                f"Cidade inconsistente: CEP {address.formatted_cep} pertence a "
                f"{address.cidade}, não {city}.",
            )

        return True, ""

    def clear_cache(self, cep: str) -> None:
        """Remove a specific CEP from cache (e.g. after a data correction)."""
        normalised = _normalise_cep(cep)
        key = f"{CACHE_KEY_PREFIX}{normalised}"
        if self._redis is not None:
            try:
                self._redis.delete(key)
            except Exception as exc:
                logger.warning("ViaCEP cache delete failed: %s", exc)
        else:
            with _MEM_CACHE_LOCK:
                _MEM_CACHE.pop(normalised, None)
        logger.debug("viacep.cache_cleared cep=%s", normalised)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    @retry_with_backoff(max_attempts=2, base_delay=1.0)
    def _fetch(self, normalised_cep: str) -> dict | None:
        """Call ViaCEP API and return raw response dict."""
        if not _HAS_HTTPX:
            logger.warning("httpx not available — ViaCEP lookup returns None")
            return None

        url = f"{VIACEP_BASE_URL}/{normalised_cep}/json/"
        try:
            with httpx.Client(timeout=self.timeout) as http:
                response = http.get(url, headers={"Accept": "application/json"})
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 400:
                raise ViaCEPInvalidError(
                    f"CEP inválido: {normalised_cep!r}"
                ) from exc
            raise

        # ViaCEP returns {"erro": true} for non-existent CEPs (with HTTP 200)
        if data.get("erro"):
            raise ViaCEPNotFoundError(
                f"CEP não encontrado: {normalised_cep!r}"
            )

        return data

    def _cache_get(self, normalised_cep: str) -> dict | None:
        key = f"{CACHE_KEY_PREFIX}{normalised_cep}"
        if self._redis is not None:
            try:
                import json as _json
                raw = self._redis.get(key)
                return _json.loads(raw) if raw else None
            except Exception as exc:
                logger.warning("ViaCEP cache get failed: %s", exc)
        else:
            with _MEM_CACHE_LOCK:
                return _MEM_CACHE.get(normalised_cep)
        return None

    def _cache_set(self, normalised_cep: str, data: dict) -> None:
        key = f"{CACHE_KEY_PREFIX}{normalised_cep}"
        if self._redis is not None:
            try:
                import json as _json
                self._redis.setex(key, self.cache_ttl, _json.dumps(data, ensure_ascii=False))
                return
            except Exception as exc:
                logger.warning("ViaCEP cache set failed: %s", exc)
        with _MEM_CACHE_LOCK:
            _MEM_CACHE[normalised_cep] = data


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalise_cep(cep: str) -> str:
    """Strip mask characters and validate format.

    Raises:
        ViaCEPInvalidError: If the result is not exactly 8 digits.
    """
    cleaned = re.sub(r"[^\d]", "", cep)
    if not CEP_PATTERN.match(cleaned):
        raise ViaCEPInvalidError(
            f"CEP deve ter 8 dígitos. Recebido: {cep!r}"
        )
    return cleaned


def _normalise_text(text: str) -> str:
    """Lowercase, strip accents (basic ASCII fold), strip whitespace."""
    import unicodedata
    nfkd = unicodedata.normalize("NFKD", text.lower().strip())
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _dict_to_address(data: dict) -> Address:
    """Convert a ViaCEP response dict to an Address dataclass."""
    cep = re.sub(r"[^\d]", "", data.get("cep", ""))
    return Address(
        cep=cep,
        logradouro=data.get("logradouro", ""),
        complemento=data.get("complemento", ""),
        bairro=data.get("bairro", ""),
        cidade=data.get("localidade", ""),
        estado=data.get("uf", ""),
        ibge=data.get("ibge", ""),
        ddd=data.get("ddd", ""),
    )


# ---------------------------------------------------------------------------
# Convenience functions (module-level, use singleton client)
# ---------------------------------------------------------------------------

_default_client: ViaCEPClient | None = None
_singleton_lock = Lock()


def get_viacep_client() -> ViaCEPClient:
    """Return module-level ViaCEPClient singleton."""
    global _default_client
    if _default_client is None:
        with _singleton_lock:
            if _default_client is None:
                _default_client = ViaCEPClient.from_env()
    return _default_client


def lookup_cep(cep: str) -> Address | None:
    """Convenience wrapper: lookup CEP using the module singleton."""
    return get_viacep_client().lookup(cep)


def validate_address_cep(city: str, state: str, cep: str) -> tuple[bool, str]:
    """Convenience wrapper: lookup CEP and validate city/state consistency.

    Returns (True, "") if consistent, or (False, "<reason>") if not.
    On API failure (lookup returns None), accepts the user's input as-is.
    """
    client = get_viacep_client()
    try:
        address = client.lookup(cep)
    except (ViaCEPInvalidError, ViaCEPNotFoundError) as exc:
        return False, str(exc)
    return client.validate_city_state(city, state, address)
