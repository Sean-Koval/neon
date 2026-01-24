"""Dashboard statistics routes."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.middleware import require_scope
from src.db.session import get_db
from src.models.auth import ApiKey, ApiKeyScope
from src.services.stats_service import StatsService

router = APIRouter(prefix="/stats")


class DashboardStats(BaseModel):
    """Dashboard statistics response.

    Provides aggregated statistics for displaying on the dashboard.
    All metrics are computed via efficient SQL aggregation.
    """

    total_runs: int = Field(
        ge=0,
        description="Total number of evaluation runs",
        examples=[156],
    )
    passed_runs: int = Field(
        ge=0,
        description="Number of runs that passed (completed with no failures or errors)",
        examples=[142],
    )
    failed_runs: int = Field(
        ge=0,
        description="Number of runs that failed (status=failed or had failures/errors)",
        examples=[14],
    )
    pass_rate: float = Field(
        ge=0.0,
        le=100.0,
        description="Percentage of passed runs (0-100)",
        examples=[91.0],
    )
    fail_rate: float = Field(
        ge=0.0,
        le=100.0,
        description="Percentage of failed runs (0-100)",
        examples=[9.0],
    )
    avg_score: float = Field(
        ge=0.0,
        le=1.0,
        description="Average score across completed runs (0-1 scale)",
        examples=[0.84],
    )
    runs_this_week: int = Field(
        ge=0,
        description="Number of runs created in the last 7 days (for trend display)",
        examples=[12],
    )


@router.get(
    "/dashboard",
    response_model=DashboardStats,
    summary="Get dashboard statistics",
    description="""
Retrieve aggregated statistics for the dashboard display.

Statistics are computed using efficient SQL aggregation for optimal performance (<50ms target).

**Pass/Fail Logic:**
- A run is **passed** if status='completed' AND summary.failed=0 AND summary.errored=0
- A run is **failed** if status='failed' OR (status='completed' AND has failures/errors)
- Runs with status pending, running, or cancelled are not counted as passed or failed

**Optional Filters:**
- `date_from`: Include only runs created on or after this date
- `date_to`: Include only runs created on or before this date

Note: `runs_this_week` always reflects the last 7 days regardless of date filters.
    """,
    responses={
        200: {
            "description": "Dashboard statistics computed successfully",
            "content": {
                "application/json": {
                    "example": {
                        "total_runs": 156,
                        "passed_runs": 142,
                        "failed_runs": 14,
                        "pass_rate": 91.0,
                        "fail_rate": 9.0,
                        "avg_score": 0.84,
                        "runs_this_week": 12,
                    }
                }
            },
        },
    },
)
async def get_dashboard_stats(
    date_from: datetime | None = Query(
        None,
        description="Start date filter (inclusive). ISO 8601 format.",
        examples=["2024-01-01T00:00:00Z"],
    ),
    date_to: datetime | None = Query(
        None,
        description="End date filter (inclusive). ISO 8601 format.",
        examples=["2024-12-31T23:59:59Z"],
    ),
    key: ApiKey = Depends(require_scope(ApiKeyScope.READ)),
    db: AsyncSession = Depends(get_db),
) -> DashboardStats:
    """Get aggregated dashboard statistics.

    Returns metrics computed via efficient SQL aggregation:
    - Total, passed, and failed run counts
    - Pass and fail rates as percentages
    - Average score across completed runs
    - Trend indicator: runs in the last 7 days
    """
    service = StatsService(db)
    stats = await service.get_dashboard_stats(
        project_id=key.project_id,
        date_from=date_from,
        date_to=date_to,
    )
    return DashboardStats(**stats)
