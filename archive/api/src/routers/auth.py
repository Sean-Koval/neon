"""Authentication routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.middleware import require_scope
from src.db.session import get_db
from src.models.auth import ApiKey, ApiKeyCreate, ApiKeyList, ApiKeyResponse, ApiKeyScope
from src.services.auth_service import AuthService

router = APIRouter(prefix="/api-keys")


@router.get("", response_model=ApiKeyList)
async def list_api_keys(
    key: ApiKey = Depends(require_scope(ApiKeyScope.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> ApiKeyList:
    """List all API keys for the project (masked)."""
    service = AuthService(db)
    keys = await service.list_keys(key.project_id)
    return ApiKeyList(items=keys, total=len(keys))


@router.post("", response_model=ApiKeyResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    data: ApiKeyCreate,
    key: ApiKey = Depends(require_scope(ApiKeyScope.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> ApiKeyResponse:
    """Create a new API key."""
    service = AuthService(db)
    return await service.create_key(key.project_id, data)


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: UUID,
    key: ApiKey = Depends(require_scope(ApiKeyScope.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Revoke an API key."""
    service = AuthService(db)
    success = await service.revoke_key(key.project_id, key_id)
    if not success:
        raise HTTPException(status_code=404, detail="API key not found")
