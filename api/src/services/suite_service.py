"""Eval suite service."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.db import EvalCaseModel, EvalSuiteModel
from src.models.eval import EvalCase, EvalCaseCreate, EvalSuite, EvalSuiteCreate, ScorerType


class SuiteService:
    """Service for eval suite operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_suites(self, project_id: UUID) -> list[EvalSuite]:
        """List all suites for a project."""
        result = await self.db.execute(
            select(EvalSuiteModel)
            .where(EvalSuiteModel.project_id == project_id)
            .options(selectinload(EvalSuiteModel.cases))
            .order_by(EvalSuiteModel.created_at.desc())
        )
        suites = result.scalars().all()
        return [self._to_suite_model(s) for s in suites]

    async def get_suite(self, project_id: UUID, suite_id: UUID) -> EvalSuite | None:
        """Get a suite by ID."""
        result = await self.db.execute(
            select(EvalSuiteModel)
            .where(
                EvalSuiteModel.id == suite_id,
                EvalSuiteModel.project_id == project_id,
            )
            .options(selectinload(EvalSuiteModel.cases))
        )
        suite = result.scalar_one_or_none()
        if not suite:
            return None
        return self._to_suite_model(suite)

    async def create_suite(self, project_id: UUID, data: EvalSuiteCreate) -> EvalSuite:
        """Create a new suite."""
        config = {
            "default_scorers": [s.value for s in data.default_scorers],
            "default_min_score": data.default_min_score,
            "default_timeout_seconds": data.default_timeout_seconds,
            "parallel": data.parallel,
            "stop_on_failure": data.stop_on_failure,
        }

        suite = EvalSuiteModel(
            project_id=project_id,
            name=data.name,
            description=data.description,
            agent_id=data.agent_id,
            config=config,
        )
        self.db.add(suite)

        # Add cases if provided
        if data.cases:
            for case_data in data.cases:
                case = EvalCaseModel(
                    suite_id=suite.id,
                    name=case_data.name,
                    description=case_data.description,
                    input=case_data.input,
                    expected_tools=case_data.expected_tools,
                    expected_tool_sequence=case_data.expected_tool_sequence,
                    expected_output_contains=case_data.expected_output_contains,
                    expected_output_pattern=case_data.expected_output_pattern,
                    scorers=[s.value for s in case_data.scorers],
                    scorer_config=case_data.scorer_config,
                    min_score=case_data.min_score,
                    timeout_seconds=case_data.timeout_seconds,
                    tags=case_data.tags,
                )
                suite.cases.append(case)

        await self.db.commit()
        await self.db.refresh(suite)
        return self._to_suite_model(suite)

    async def update_suite(
        self, project_id: UUID, suite_id: UUID, data: EvalSuiteCreate
    ) -> EvalSuite | None:
        """Update a suite."""
        result = await self.db.execute(
            select(EvalSuiteModel).where(
                EvalSuiteModel.id == suite_id,
                EvalSuiteModel.project_id == project_id,
            )
        )
        suite = result.scalar_one_or_none()
        if not suite:
            return None

        suite.name = data.name
        suite.description = data.description
        suite.agent_id = data.agent_id
        suite.config = {
            "default_scorers": [s.value for s in data.default_scorers],
            "default_min_score": data.default_min_score,
            "default_timeout_seconds": data.default_timeout_seconds,
            "parallel": data.parallel,
            "stop_on_failure": data.stop_on_failure,
        }

        await self.db.commit()
        await self.db.refresh(suite)
        return self._to_suite_model(suite)

    async def delete_suite(self, project_id: UUID, suite_id: UUID) -> bool:
        """Delete a suite."""
        result = await self.db.execute(
            select(EvalSuiteModel).where(
                EvalSuiteModel.id == suite_id,
                EvalSuiteModel.project_id == project_id,
            )
        )
        suite = result.scalar_one_or_none()
        if not suite:
            return False

        await self.db.delete(suite)
        await self.db.commit()
        return True

    async def list_cases(self, project_id: UUID, suite_id: UUID) -> list[EvalCase]:
        """List all cases in a suite."""
        result = await self.db.execute(
            select(EvalCaseModel)
            .join(EvalSuiteModel)
            .where(
                EvalSuiteModel.project_id == project_id,
                EvalCaseModel.suite_id == suite_id,
            )
            .order_by(EvalCaseModel.created_at)
        )
        cases = result.scalars().all()
        return [self._to_case_model(c) for c in cases]

    async def create_case(
        self, project_id: UUID, suite_id: UUID, data: EvalCaseCreate
    ) -> EvalCase | None:
        """Create a new case in a suite."""
        # Verify suite belongs to project
        result = await self.db.execute(
            select(EvalSuiteModel).where(
                EvalSuiteModel.id == suite_id,
                EvalSuiteModel.project_id == project_id,
            )
        )
        suite = result.scalar_one_or_none()
        if not suite:
            return None

        case = EvalCaseModel(
            suite_id=suite_id,
            name=data.name,
            description=data.description,
            input=data.input,
            expected_tools=data.expected_tools,
            expected_tool_sequence=data.expected_tool_sequence,
            expected_output_contains=data.expected_output_contains,
            expected_output_pattern=data.expected_output_pattern,
            scorers=[s.value for s in data.scorers],
            scorer_config=data.scorer_config,
            min_score=data.min_score,
            timeout_seconds=data.timeout_seconds,
            tags=data.tags,
        )
        self.db.add(case)
        await self.db.commit()
        await self.db.refresh(case)
        return self._to_case_model(case)

    def _to_suite_model(self, suite: EvalSuiteModel) -> EvalSuite:
        """Convert DB model to Pydantic model."""
        config = suite.config or {}
        return EvalSuite(
            id=suite.id,
            project_id=suite.project_id,
            name=suite.name,
            description=suite.description,
            agent_id=suite.agent_id,
            default_scorers=[
                ScorerType(s) for s in config.get("default_scorers", ["tool_selection", "reasoning"])
            ],
            default_min_score=config.get("default_min_score", 0.7),
            default_timeout_seconds=config.get("default_timeout_seconds", 300),
            parallel=config.get("parallel", True),
            stop_on_failure=config.get("stop_on_failure", False),
            created_at=suite.created_at,
            updated_at=suite.updated_at,
            cases=[self._to_case_model(c) for c in suite.cases],
        )

    def _to_case_model(self, case: EvalCaseModel) -> EvalCase:
        """Convert DB model to Pydantic model."""
        return EvalCase(
            id=case.id,
            suite_id=case.suite_id,
            name=case.name,
            description=case.description,
            input=case.input,
            expected_tools=case.expected_tools,
            expected_tool_sequence=case.expected_tool_sequence,
            expected_output_contains=case.expected_output_contains,
            expected_output_pattern=case.expected_output_pattern,
            scorers=[ScorerType(s) for s in case.scorers],
            scorer_config=case.scorer_config,
            min_score=case.min_score,
            timeout_seconds=case.timeout_seconds,
            tags=case.tags or [],
            created_at=case.created_at,
            updated_at=case.updated_at,
        )
