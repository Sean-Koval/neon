"""Authentication models."""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field


class ApiKeyScope(str, Enum):
    """API key permission scopes."""

    READ = "read"  # View suites, runs, results
    WRITE = "write"  # Create/update suites, cases
    EXECUTE = "execute"  # Run evaluations
    ADMIN = "admin"  # All permissions


class ApiKeyCreate(BaseModel):
    """Create API key request."""

    name: str = Field(..., description="Human-readable name for the key")
    scopes: list[ApiKeyScope] = Field(
        default=[ApiKeyScope.READ, ApiKeyScope.EXECUTE],
        description="Permission scopes",
    )
    expires_in_days: int | None = Field(
        None, description="Days until expiration (None = never)"
    )


class ApiKeyResponse(BaseModel):
    """API key creation response (includes full key, only shown once)."""

    id: UUID
    key: str  # Full key, only returned on creation
    name: str
    key_prefix: str
    scopes: list[ApiKeyScope]
    created_at: datetime
    expires_at: datetime | None


class ApiKey(BaseModel):
    """API key (without sensitive data)."""

    id: UUID
    key_prefix: str
    name: str
    project_id: UUID
    scopes: list[ApiKeyScope]
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime | None
    is_active: bool

    class Config:
        from_attributes = True


class ApiKeyList(BaseModel):
    """List of API keys."""

    items: list[ApiKey]
    total: int


class Project(BaseModel):
    """Project model."""

    id: UUID
    name: str
    slug: str
    mlflow_tracking_uri: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
