"""Authentication service."""

import secrets
from datetime import datetime, timedelta
from uuid import UUID

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models.auth import ApiKey, ApiKeyCreate, ApiKeyResponse, ApiKeyScope
from src.models.db import ApiKeyModel


class AuthService:
    """Service for authentication operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_keys(self, project_id: UUID) -> list[ApiKey]:
        """List all API keys for a project."""
        result = await self.db.execute(
            select(ApiKeyModel)
            .where(ApiKeyModel.project_id == project_id)
            .order_by(ApiKeyModel.created_at.desc())
        )
        keys = result.scalars().all()
        return [
            ApiKey(
                id=k.id,
                key_prefix=k.key_prefix,
                name=k.name,
                project_id=k.project_id,
                scopes=[ApiKeyScope(s) for s in k.scopes],
                created_at=k.created_at,
                last_used_at=k.last_used_at,
                expires_at=k.expires_at,
                is_active=k.is_active,
            )
            for k in keys
        ]

    async def create_key(self, project_id: UUID, data: ApiKeyCreate) -> ApiKeyResponse:
        """Create a new API key."""
        # Generate key: ae_live_<32 random chars>
        random_part = secrets.token_hex(16)  # 32 hex chars
        full_key = f"{settings.api_key_prefix}_live_{random_part}"
        prefix = random_part[:8]

        # Hash the full key
        key_hash = bcrypt.hashpw(full_key.encode(), bcrypt.gensalt()).decode()

        # Calculate expiration
        expires_at = None
        if data.expires_in_days:
            expires_at = datetime.utcnow() + timedelta(days=data.expires_in_days)

        # Create record
        key_record = ApiKeyModel(
            key_prefix=prefix,
            key_hash=key_hash,
            name=data.name,
            project_id=project_id,
            scopes=[s.value for s in data.scopes],
            expires_at=expires_at,
        )
        self.db.add(key_record)
        await self.db.commit()
        await self.db.refresh(key_record)

        return ApiKeyResponse(
            id=key_record.id,
            key=full_key,  # Only returned on creation
            name=key_record.name,
            key_prefix=key_record.key_prefix,
            scopes=[ApiKeyScope(s) for s in key_record.scopes],
            created_at=key_record.created_at,
            expires_at=key_record.expires_at,
        )

    async def revoke_key(self, project_id: UUID, key_id: UUID) -> bool:
        """Revoke an API key."""
        result = await self.db.execute(
            select(ApiKeyModel).where(
                ApiKeyModel.id == key_id,
                ApiKeyModel.project_id == project_id,
            )
        )
        key_record = result.scalar_one_or_none()

        if not key_record:
            return False

        key_record.is_active = False
        await self.db.commit()
        return True
