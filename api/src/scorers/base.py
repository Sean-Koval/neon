"""Base scorer class and types."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from src.models.db import EvalCaseModel


@dataclass
class ScorerResult:
    """Result from a scorer."""

    score: float  # 0.0 to 1.0
    reason: str
    evidence: list[str] = field(default_factory=list)


class Scorer(ABC):
    """Abstract base class for scorers."""

    name: str = "base"
    description: str = "Base scorer"

    @abstractmethod
    async def score(
        self,
        case: EvalCaseModel,
        output: dict[str, Any],
        config: dict[str, Any] | None = None,
    ) -> ScorerResult:
        """Score the agent output against the expected behavior.

        Args:
            case: The eval case with expected behavior
            output: The agent's output including tools_called, output text, etc.
            config: Optional scorer-specific configuration

        Returns:
            ScorerResult with score (0-1), reason, and evidence
        """
        ...

    def _normalize_score(self, score: float) -> float:
        """Ensure score is between 0 and 1."""
        return max(0.0, min(1.0, score))
