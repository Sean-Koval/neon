"""Application configuration."""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Environment
    environment: Literal["development", "staging", "production"] = "development"
    debug: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://agenteval:agenteval@localhost:5432/agenteval"

    # MLflow
    mlflow_tracking_uri: str = "http://localhost:5000"

    # Vertex AI
    google_cloud_project: str = ""
    vertex_ai_location: str = "us-central1"

    # Scoring
    default_scoring_model: str = "claude-3-5-sonnet@20241022"
    scoring_timeout_seconds: int = 60

    # API
    api_key_prefix: str = "ae"
    cors_origins: list[str] = ["http://localhost:3000"]

    # Eval execution
    max_parallel_cases: int = 10
    default_timeout_seconds: int = 300

    # Rate limiting
    rate_limit_enabled: bool = True
    rate_limit_requests_per_minute: int = 100


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
