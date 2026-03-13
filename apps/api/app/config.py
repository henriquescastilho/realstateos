from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Real Estate OS API"
    api_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://postgres:postgres@db:5432/realestateos"
    redis_url: str = "redis://redis:6379/0"
    s3_endpoint_url: str = "http://minio:9000"
    s3_access_key_id: str = "minioadmin"
    s3_secret_access_key: str = "minioadmin"
    s3_bucket_name: str = "realestateos"
    cors_allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    worker_poll_interval_seconds: float = 2.0
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    google_adk_model: str = "gemini-2.0-flash"
    santander_sandbox_enabled: bool = True
    santander_base_url: str = "https://sandbox.santander.example"
    santander_client_id: str = "sandbox-client-id"
    santander_client_secret: str = "sandbox-client-secret"
    payment_mock_fallback_enabled: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]


settings = Settings()
