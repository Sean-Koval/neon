"""Pydantic models for API requests/responses."""

from src.models.auth import ApiKey, ApiKeyCreate, ApiKeyResponse, ApiKeyScope
from src.models.eval import (
    CompareRequest,
    CompareResponse,
    EvalCase,
    EvalCaseBase,
    EvalCaseCreate,
    EvalResult,
    EvalResultList,
    EvalResultStatus,
    EvalRun,
    EvalRunCreate,
    EvalRunList,
    EvalRunStatus,
    EvalRunSummary,
    EvalSuite,
    EvalSuiteBase,
    EvalSuiteCreate,
    EvalSuiteList,
    ImprovementDetail,
    RegressionDetail,
    ScoreDetail,
    ScorerType,
    TriggerType,
)

__all__ = [
    # Auth
    "ApiKey",
    "ApiKeyCreate",
    "ApiKeyResponse",
    "ApiKeyScope",
    # Eval - Enums
    "ScorerType",
    "EvalRunStatus",
    "EvalResultStatus",
    "TriggerType",
    # Eval - Case
    "EvalCaseBase",
    "EvalCase",
    "EvalCaseCreate",
    # Eval - Suite
    "EvalSuiteBase",
    "EvalSuite",
    "EvalSuiteCreate",
    "EvalSuiteList",
    # Eval - Run
    "EvalRun",
    "EvalRunCreate",
    "EvalRunList",
    "EvalRunSummary",
    # Eval - Result
    "EvalResult",
    "EvalResultList",
    "ScoreDetail",
    # Comparison
    "CompareRequest",
    "CompareResponse",
    "RegressionDetail",
    "ImprovementDetail",
]
