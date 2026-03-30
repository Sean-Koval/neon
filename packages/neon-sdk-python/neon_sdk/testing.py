"""Test suite definition helpers for Python eval authoring.

This module provides the same authoring surface the dashboard exports for
Python users: create a suite, add tests, and keep the resulting definition as
plain typed data that can be committed to an eval repository.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from neon_sdk.scorers.base import Scorer
else:
    Scorer = Any


def _copy_dict(value: dict[str, Any]) -> dict[str, Any]:
    """Return a shallow copy of an input mapping."""
    return dict(value)


def _copy_list(value: list[str] | None) -> list[str] | None:
    """Return a shallow copy of a string list."""
    if value is None:
        return None
    return list(value)


def _serialize_scorer_reference(scorer: Scorer | str) -> str:
    """Return a stable scorer identifier for transport-oriented payloads."""
    if isinstance(scorer, str):
        return scorer
    return scorer.name


@dataclass(slots=True)
class TestDefinition:
    """Structured definition for a single evaluation test case.

    Args:
        name: Human-readable test name.
        input: Input payload passed to the agent under test.
        description: Optional narrative description.
        expected_tools: Tools that should be called at least once.
        expected_tool_sequence: Ordered tool sequence expectation.
        expected_output_contains: Output substrings that should appear.
        expected_output_pattern: Regex pattern expected in final output.
        scorers: Scorers to run for the case.
        min_score: Minimum passing score.
        timeout_seconds: Timeout budget for the case.
        tags: Optional grouping tags.
    """

    name: str
    input: dict[str, Any]
    description: str | None = None
    expected_tools: list[str] | None = None
    expected_tool_sequence: list[str] | None = None
    expected_output_contains: list[str] | None = None
    expected_output_pattern: str | None = None
    scorers: list[Scorer | str] = field(default_factory=list)
    min_score: float = 0.0
    timeout_seconds: int = 60
    tags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Return a portable dictionary representation of the test."""
        payload: dict[str, Any] = {
            "name": self.name,
            "input": _copy_dict(self.input),
            "min_score": self.min_score,
            "timeout_seconds": self.timeout_seconds,
        }
        if self.description:
            payload["description"] = self.description
        if self.expected_tools:
            payload["expected_tools"] = _copy_list(self.expected_tools)
        if self.expected_tool_sequence:
            payload["expected_tool_sequence"] = _copy_list(self.expected_tool_sequence)
        if self.expected_output_contains:
            payload["expected_output_contains"] = _copy_list(self.expected_output_contains)
        if self.expected_output_pattern:
            payload["expected_output_pattern"] = self.expected_output_pattern
        if self.scorers:
            payload["scorers"] = [
                _serialize_scorer_reference(scorer) for scorer in self.scorers
            ]
        if self.tags:
            payload["tags"] = list(self.tags)
        return payload


@dataclass(slots=True)
class SuiteDefinition:
    """Structured definition for an evaluation suite.

    Args:
        name: Suite name.
        description: Optional suite description.
        agent_id: Optional agent identifier.
        default_scorers: Default scorer names applied by higher-level tooling.
        default_min_score: Default passing threshold for cases.
        default_timeout_seconds: Default timeout budget for cases.
        parallel: Whether cases may run concurrently.
        stop_on_failure: Whether execution should stop after the first failure.
        cases: Mutable list of cases in the suite.
    """

    name: str
    description: str | None = None
    agent_id: str | None = None
    default_scorers: list[str] = field(default_factory=list)
    default_min_score: float = 0.0
    default_timeout_seconds: int = 300
    parallel: bool = False
    stop_on_failure: bool = False
    cases: list[TestDefinition] = field(default_factory=list)

    def add_test(self, test: TestDefinition) -> TestDefinition:
        """Append a test to the suite and return it."""
        self.cases.append(test)
        return test

    def to_dict(self) -> dict[str, Any]:
        """Return a portable dictionary representation of the suite."""
        payload: dict[str, Any] = {
            "name": self.name,
            "description": self.description,
            "agent_id": self.agent_id,
            "default_scorers": list(self.default_scorers),
            "default_min_score": self.default_min_score,
            "default_timeout_seconds": self.default_timeout_seconds,
            "parallel": self.parallel,
            "stop_on_failure": self.stop_on_failure,
            "cases": [case.to_dict() for case in self.cases],
        }
        return payload


def define_suite(
    *,
    name: str,
    description: str | None = None,
    agent_id: str | None = None,
    default_scorers: list[str] | None = None,
    default_min_score: float = 0.0,
    default_timeout_seconds: int = 300,
    parallel: bool = False,
    stop_on_failure: bool = False,
) -> SuiteDefinition:
    """Create a typed evaluation suite definition."""
    return SuiteDefinition(
        name=name,
        description=description,
        agent_id=agent_id,
        default_scorers=list(default_scorers or []),
        default_min_score=default_min_score,
        default_timeout_seconds=default_timeout_seconds,
        parallel=parallel,
        stop_on_failure=stop_on_failure,
    )


def define_test(
    suite: SuiteDefinition,
    *,
    name: str,
    input: dict[str, Any],
    description: str | None = None,
    expected_tools: list[str] | None = None,
    expected_tool_sequence: list[str] | None = None,
    expected_output_contains: list[str] | None = None,
    expected_output_pattern: str | None = None,
    scorers: list[Scorer | str] | None = None,
    min_score: float | None = None,
    timeout_seconds: int | None = None,
    tags: list[str] | None = None,
) -> TestDefinition:
    """Create a test definition and append it to a suite."""
    test = TestDefinition(
        name=name,
        input=_copy_dict(input),
        description=description,
        expected_tools=_copy_list(expected_tools),
        expected_tool_sequence=_copy_list(expected_tool_sequence),
        expected_output_contains=_copy_list(expected_output_contains),
        expected_output_pattern=expected_output_pattern,
        scorers=list(scorers or []),
        min_score=min_score if min_score is not None else suite.default_min_score,
        timeout_seconds=(
            timeout_seconds
            if timeout_seconds is not None
            else suite.default_timeout_seconds
        ),
        tags=list(tags or []),
    )
    return suite.add_test(test)
