"""Tests for Python suite definition helpers."""

from neon_sdk import define_suite, define_test
from neon_sdk.scorers import contains


class TestSuiteDefinitions:
    """Tests for define_suite and define_test."""

    def test_define_suite_tracks_defaults(self) -> None:
        """define_suite should preserve suite-level authoring defaults."""
        suite = define_suite(
            name="core-tests",
            description="Core regression suite",
            agent_id="agent-1",
            default_scorers=["tool_selection", "reasoning"],
            default_min_score=0.8,
            default_timeout_seconds=180,
            parallel=True,
            stop_on_failure=True,
        )

        assert suite.name == "core-tests"
        assert suite.default_scorers == ["tool_selection", "reasoning"]
        assert suite.parallel is True
        assert suite.stop_on_failure is True
        assert suite.cases == []

    def test_define_test_appends_case_and_applies_suite_defaults(self) -> None:
        """define_test should append tests and inherit unset suite defaults."""
        suite = define_suite(
            name="core-tests",
            default_min_score=0.75,
            default_timeout_seconds=120,
        )

        test = define_test(
            suite,
            name="refund-flow",
            input={"query": "Refund my order"},
            expected_tools=["lookup_order", "process_refund"],
            expected_tool_sequence=["lookup_order", "process_refund"],
            expected_output_contains=["refund", "processed"],
            expected_output_pattern="refund.*processed",
            scorers=[contains(["refund"]), "tool_selection"],
            tags=["refund"],
        )

        assert test is suite.cases[0]
        assert test.min_score == 0.75
        assert test.timeout_seconds == 120
        assert test.tags == ["refund"]

        assert suite.to_dict() == {
            "name": "core-tests",
            "description": None,
            "agent_id": None,
            "default_scorers": [],
            "default_min_score": 0.75,
            "default_timeout_seconds": 120,
            "parallel": False,
            "stop_on_failure": False,
            "cases": [
                {
                    "name": "refund-flow",
                    "input": {"query": "Refund my order"},
                    "expected_tools": ["lookup_order", "process_refund"],
                    "expected_tool_sequence": [
                        "lookup_order",
                        "process_refund",
                    ],
                    "expected_output_contains": ["refund", "processed"],
                    "expected_output_pattern": "refund.*processed",
                    "scorers": ["contains", "tool_selection"],
                    "min_score": 0.75,
                    "timeout_seconds": 120,
                    "tags": ["refund"],
                }
            ],
        }
