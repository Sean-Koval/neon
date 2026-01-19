"""Pydantic models for API requests/responses."""

from src.models.auth import ApiKey, ApiKeyCreate, ApiKeyResponse, ApiKeyScope
from src.models.eval import (
    EvalCase,
    EvalCaseCreate,
    EvalResult,
    EvalRun,
    EvalRunCreate,
    EvalRunStatus,
    EvalSuite,
    EvalSuiteCreate,
    ScorerType,
)

__all__ = [
    # Auth
    "ApiKey",
    "ApiKeyCreate",
    "ApiKeyResponse",
    "ApiKeyScope",
    # Eval
    "ScorerType",
    "EvalCase",
    "EvalCaseCreate",
    "EvalSuite",
    "EvalSuiteCreate",
    "EvalRun",
    "EvalRunCreate",
    "EvalRunStatus",
    "EvalResult",
]
