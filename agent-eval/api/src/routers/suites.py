"""Eval suite routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.middleware import require_scope
from src.db.session import get_db
from src.models.auth import ApiKey, ApiKeyScope
from src.models.eval import (
    EvalCase,
    EvalCaseCreate,
    EvalSuite,
    EvalSuiteCreate,
    EvalSuiteList,
)
from src.services.suite_service import SuiteService

router = APIRouter(prefix="/suites")


@router.get("", response_model=EvalSuiteList)
async def list_suites(
    key: ApiKey = Depends(require_scope(ApiKeyScope.READ)),
    db: AsyncSession = Depends(get_db),
) -> EvalSuiteList:
    """List all eval suites in the project."""
    service = SuiteService(db)
    suites = await service.list_suites(key.project_id)
    return EvalSuiteList(items=suites, total=len(suites))


@router.post("", response_model=EvalSuite, status_code=status.HTTP_201_CREATED)
async def create_suite(
    data: EvalSuiteCreate,
    key: ApiKey = Depends(require_scope(ApiKeyScope.WRITE)),
    db: AsyncSession = Depends(get_db),
) -> EvalSuite:
    """Create a new eval suite."""
    service = SuiteService(db)
    return await service.create_suite(key.project_id, data)


@router.get("/{suite_id}", response_model=EvalSuite)
async def get_suite(
    suite_id: UUID,
    key: ApiKey = Depends(require_scope(ApiKeyScope.READ)),
    db: AsyncSession = Depends(get_db),
) -> EvalSuite:
    """Get an eval suite by ID."""
    service = SuiteService(db)
    suite = await service.get_suite(key.project_id, suite_id)
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    return suite


@router.patch("/{suite_id}", response_model=EvalSuite)
async def update_suite(
    suite_id: UUID,
    data: EvalSuiteCreate,
    key: ApiKey = Depends(require_scope(ApiKeyScope.WRITE)),
    db: AsyncSession = Depends(get_db),
) -> EvalSuite:
    """Update an eval suite."""
    service = SuiteService(db)
    suite = await service.update_suite(key.project_id, suite_id, data)
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    return suite


@router.delete("/{suite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_suite(
    suite_id: UUID,
    key: ApiKey = Depends(require_scope(ApiKeyScope.WRITE)),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete an eval suite."""
    service = SuiteService(db)
    success = await service.delete_suite(key.project_id, suite_id)
    if not success:
        raise HTTPException(status_code=404, detail="Suite not found")


# =============================================================================
# Cases
# =============================================================================


@router.get("/{suite_id}/cases", response_model=list[EvalCase])
async def list_cases(
    suite_id: UUID,
    key: ApiKey = Depends(require_scope(ApiKeyScope.READ)),
    db: AsyncSession = Depends(get_db),
) -> list[EvalCase]:
    """List all cases in a suite."""
    service = SuiteService(db)
    return await service.list_cases(key.project_id, suite_id)


@router.post("/{suite_id}/cases", response_model=EvalCase, status_code=status.HTTP_201_CREATED)
async def create_case(
    suite_id: UUID,
    data: EvalCaseCreate,
    key: ApiKey = Depends(require_scope(ApiKeyScope.WRITE)),
    db: AsyncSession = Depends(get_db),
) -> EvalCase:
    """Create a new case in a suite."""
    service = SuiteService(db)
    case = await service.create_case(key.project_id, suite_id, data)
    if not case:
        raise HTTPException(status_code=404, detail="Suite not found")
    return case
