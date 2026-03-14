"""
Real Estate OS — Application Settings

Pydantic-Settings powered configuration with:
  - Environment-specific defaults (development / staging / production)
  - Full field validation and type safety
  - Optional HashiCorp Vault integration (stub — wire up hvac if needed)
  - `.env` file support for local development

Usage:
    from app.config import settings
    settings.database_url          # → str
    settings.cors_allowed_origins_list  # → list[str]
"""

from __future__ import annotations

import os
from enum import Enum
from functools import lru_cache
from typing import Optional

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# ─── Environment enum ─────────────────────────────────────────────────────────


class Environment(str, Enum):
    development = "development"
    staging = "staging"
    production = "production"
    test = "test"


# ─── Weak-secret guard ────────────────────────────────────────────────────────

_WEAK_SECRETS = {
    "change-me",
    "secret",
    "changeme",
    "password",
    "dev-secret",
    "dev-only-unsafe-secret-replace-in-production",
}


# ─── Settings ─────────────────────────────────────────────────────────────────


class Settings(BaseSettings):
    # ── Core ───────────────────────────────────────────────────────────────
    app_name: str = "Real Estate OS API"
    api_prefix: str = "/api/v1"
    environment: Environment = Environment.development
    debug: bool = False  # overridden per environment below
    port: int = 8000

    # ── Database ──────────────────────────────────────────────────────────
    database_url: str = "postgresql+psycopg://postgres:postgres@db:5432/realestateos"
    # Async pool settings
    db_pool_size: int = 20
    db_max_overflow: int = 10
    db_pool_timeout: int = 30
    db_pool_recycle: int = 3600

    # ── Redis ─────────────────────────────────────────────────────────────
    redis_url: str = "redis://redis:6379/0"
    cache_default_ttl: int = 300  # seconds

    # ── MinIO / S3 ────────────────────────────────────────────────────────
    s3_endpoint_url: str = "http://minio:9000"
    s3_access_key_id: str = "minioadmin"
    s3_secret_access_key: str = "minioadmin"
    s3_bucket_name: str = "realestateos"
    s3_region: str = "us-east-1"
    upload_max_size_bytes: int = 52_428_800  # 50 MB

    # ── CORS ──────────────────────────────────────────────────────────────
    cors_allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # ── JWT / Auth ────────────────────────────────────────────────────────
    jwt_secret: str = Field(..., description="Must be at least 32 characters")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7

    # ── Worker ────────────────────────────────────────────────────────────
    worker_poll_interval_seconds: float = 2.0
    worker_max_concurrent_tasks: int = 10

    # ── Google ADK / AI ───────────────────────────────────────────────────
    google_adk_model: str = "gemini-2.0-flash"
    gemini_api_key: Optional[str] = None

    # ── Santander Bank integration ────────────────────────────────────────
    santander_sandbox_enabled: bool = True
    santander_base_url: str = "https://sandbox.santander.example"
    santander_client_id: str = "sandbox-client-id"
    santander_client_secret: str = "sandbox-client-secret"
    payment_mock_fallback_enabled: bool = True

    # ── Observability ─────────────────────────────────────────────────────
    log_level: str = "INFO"
    log_format: str = "json"  # "json" | "pretty"
    enable_metrics: bool = True
    metrics_path: str = "/metrics"
    # Sentry DSN — optional, errors reported to Sentry if set
    sentry_dsn: Optional[str] = None

    # ── Rate limiting ─────────────────────────────────────────────────────
    rate_limit_global: str = "100/minute"
    rate_limit_auth: str = "10/minute"
    rate_limit_agents: str = "20/minute"

    # ── Vault integration (optional) ──────────────────────────────────────
    # Set vault_addr to enable. Secrets fetched at startup and merged into settings.
    vault_addr: Optional[str] = None
    vault_token: Optional[str] = None
    vault_path: str = "secret/realstateos"  # KV v2 path

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # Allow extra env vars to be ignored (useful for Docker env pass-through)
        extra="ignore",
        case_sensitive=False,
    )

    # ── Validators ────────────────────────────────────────────────────────

    @field_validator("jwt_secret")
    @classmethod
    def jwt_secret_must_be_strong(cls, v: str) -> str:
        if v.lower() in _WEAK_SECRETS or len(v) < 32:
            raise ValueError(
                "JWT_SECRET is too weak. Provide a strong random secret "
                "of at least 32 characters via the JWT_SECRET env var."
            )
        return v

    @field_validator("log_format")
    @classmethod
    def validate_log_format(cls, v: str) -> str:
        if v not in ("json", "pretty"):
            raise ValueError("log_format must be 'json' or 'pretty'")
        return v

    @model_validator(mode="after")
    def apply_environment_defaults(self) -> "Settings":
        """Apply sensible defaults based on the active environment."""
        if self.environment == Environment.production:
            # Force strict settings in production
            object.__setattr__(self, "debug", False)
            object.__setattr__(self, "log_format", "json")
            object.__setattr__(self, "santander_sandbox_enabled", False)
            object.__setattr__(self, "payment_mock_fallback_enabled", False)
        elif self.environment == Environment.staging:
            object.__setattr__(self, "debug", False)
            object.__setattr__(self, "log_format", "json")
        elif self.environment in (Environment.development, Environment.test):
            object.__setattr__(self, "debug", True)
            object.__setattr__(self, "log_format", "pretty")
        return self

    # ── Computed properties ───────────────────────────────────────────────

    @property
    def cors_allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == Environment.production

    @property
    def is_development(self) -> bool:
        return self.environment in (Environment.development, Environment.test)


# ─── Vault integration stub ──────────────────────────────────────────────────


def _load_from_vault(settings: Settings) -> dict:
    """
    Optional HashiCorp Vault secret loader.

    Fetches secrets from Vault KV v2 and returns them as a dict
    to be merged into the settings instance.

    Requires: pip install hvac
    Env vars: VAULT_ADDR, VAULT_TOKEN (or VAULT_ROLE_ID + VAULT_SECRET_ID for AppRole)

    Returns empty dict if vault_addr is not configured or hvac is unavailable.
    """
    if not settings.vault_addr:
        return {}

    try:
        import hvac  # type: ignore[import]
    except ImportError:
        import warnings
        warnings.warn(
            "vault_addr is configured but hvac is not installed. "
            "Install with: pip install hvac",
            RuntimeWarning,
            stacklevel=2,
        )
        return {}

    try:
        client = hvac.Client(url=settings.vault_addr, token=settings.vault_token)
        if not client.is_authenticated():
            raise RuntimeError("Vault authentication failed — check VAULT_TOKEN")

        # Read KV v2 secret at vault_path
        response = client.secrets.kv.v2.read_secret_version(
            path=settings.vault_path,
            raise_on_deleted_version=True,
        )
        data: dict = response.get("data", {}).get("data", {})

        # Map Vault keys → settings field names (upper → lower)
        return {k.lower(): v for k, v in data.items()}

    except Exception as exc:
        import warnings
        warnings.warn(
            f"Failed to load secrets from Vault ({settings.vault_addr}): {exc}",
            RuntimeWarning,
            stacklevel=2,
        )
        return {}


# ─── Factory (with Vault overlay) ────────────────────────────────────────────


def _build_settings() -> Settings:
    """
    Build the Settings object. If Vault is configured, overlay secrets from Vault.
    The overlay uses object.__setattr__ to bypass Pydantic's immutability.
    """
    s = Settings()

    vault_overrides = _load_from_vault(s)
    for field_name, value in vault_overrides.items():
        if field_name in Settings.model_fields:
            try:
                object.__setattr__(s, field_name, value)
            except Exception:
                pass  # non-critical — continue with env-var value

    return s


# ─── Module-level singleton ───────────────────────────────────────────────────

settings: Settings = _build_settings()
