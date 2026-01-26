"""Eval case routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.middleware import require_scope
from src.db.session import get_db
from src.models.auth import ApiKey, ApiKeyScope
from src.models.eval import EvalCase, EvalCaseUpdate
from src.services.suite_service import SuiteService

router = APIRouter(prefix="/cases")


@router.get("/{case_id}", response_model=EvalCase)
async def get_case(
    case_id: UUID,
    key: ApiKey = Depends(require_scope(ApiKeyScope.READ)),
    db: AsyncSession = Depends(get_db),
) -> EvalCase:
    """Get an eval case by ID."""
    service = SuiteService(db)
    case = await service.get_case(key.project_id, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.patch("/{case_id}", response_model=EvalCase)
async def update_case(
    case_id: UUID,
    data: EvalCaseUpdate,
    key: ApiKey = Depends(require_scope(ApiKeyScope.WRITE)),
    db: AsyncSession = Depends(get_db),
) -> EvalCase:
    """Update an eval case."""
    service = SuiteService(db)
    case = await service.update_case(key.project_id, case_id, data)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_case(
    case_id: UUID,
    key: ApiKey = Depends(require_scope(ApiKeyScope.WRITE)),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete an eval case."""
    service = SuiteService(db)
    success = await service.delete_case(key.project_id, case_id)
    if not success:
        raise HTTPException(status_code=404, detail="Case not found")
