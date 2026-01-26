"""API key authentication middleware."""

from collections.abc import Callable
from datetime import datetime

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_db
from src.models.auth import ApiKey, ApiKeyScope
from src.models.db import ApiKeyModel

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(
    api_key: str | None = Depends(api_key_header),
    db: AsyncSession = Depends(get_db),
) -> ApiKey:
    """Verify API key and return key object."""
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # Extract prefix (first 8 chars after environment marker)
    # Format: ae_live_xxxxxxxx... -> prefix is first 8 of random part
    parts = api_key.split("_")
    if len(parts) != 3 or parts[0] != "ae":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key format",
        )

    prefix = parts[2][:8]

    # Find key by prefix
    result = await db.execute(
        select(ApiKeyModel).where(
            ApiKeyModel.key_prefix == prefix,
            ApiKeyModel.is_active == True,  # noqa: E712
        )
    )
    key_record = result.scalar_one_or_none()

    if not key_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    # Verify full key hash
    if not bcrypt.checkpw(api_key.encode(), key_record.key_hash.encode()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    # Check expiration
    if key_record.expires_at and key_record.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key expired",
        )

    # Update last used timestamp
    key_record.last_used_at = datetime.utcnow()
    await db.commit()

    # Return as Pydantic model
    return ApiKey(
        id=key_record.id,
        key_prefix=key_record.key_prefix,
        name=key_record.name,
        project_id=key_record.project_id,
        scopes=[ApiKeyScope(s) for s in key_record.scopes],
        created_at=key_record.created_at,
        last_used_at=key_record.last_used_at,
        expires_at=key_record.expires_at,
        is_active=key_record.is_active,
    )


def require_scope(scope: ApiKeyScope) -> Callable[..., ApiKey]:
    """Dependency that checks for required scope."""

    async def check_scope(key: ApiKey = Depends(verify_api_key)) -> ApiKey:
        if scope not in key.scopes and ApiKeyScope.ADMIN not in key.scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required scope: {scope.value}",
            )
        return key

    return check_scope
