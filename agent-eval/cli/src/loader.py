"""YAML suite loader and validator."""

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field, ValidationError


class EvalCaseSchema(BaseModel):
    """Schema for eval case validation."""

    name: str
    description: str | None = None
    input: dict[str, Any]
    expected_tools: list[str] | None = None
    expected_tool_sequence: list[str] | None = None
    expected_output_contains: list[str] | None = None
    expected_output_pattern: str | None = None
    scorers: list[str] = Field(default=["tool_selection", "reasoning"])
    scorer_config: dict[str, Any] | None = None
    min_score: float = 0.7
    timeout_seconds: int = 300
    tags: list[str] = Field(default_factory=list)


class EvalSuiteSchema(BaseModel):
    """Schema for eval suite validation."""

    name: str
    description: str | None = None
    agent_id: str
    default_scorers: list[str] = Field(default=["tool_selection", "reasoning"])
    default_min_score: float = 0.7
    default_timeout_seconds: int = 300
    parallel: bool = True
    stop_on_failure: bool = False
    cases: list[EvalCaseSchema] = Field(default_factory=list)


def load_suite(path: Path) -> dict[str, Any]:
    """Load eval suite from YAML file.

    Args:
        path: Path to YAML file

    Returns:
        Suite data as dictionary

    Raises:
        ValueError: If file is invalid
    """
    with open(path) as f:
        data = yaml.safe_load(f)

    if not data:
        raise ValueError(f"Empty or invalid YAML file: {path}")

    # Validate against schema
    try:
        suite = EvalSuiteSchema(**data)
        return suite.model_dump()
    except ValidationError as e:
        errors = []
        for error in e.errors():
            loc = ".".join(str(l) for l in error["loc"])
            errors.append(f"{loc}: {error['msg']}")
        raise ValueError(f"Invalid suite file:\n" + "\n".join(errors))


def validate_suite(path: Path) -> list[str]:
    """Validate a suite YAML file.

    Args:
        path: Path to YAML file

    Returns:
        List of validation errors (empty if valid)
    """
    errors = []

    try:
        with open(path) as f:
            data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        return [f"YAML syntax error: {e}"]

    if not data:
        return ["Empty or invalid YAML file"]

    # Validate against schema
    try:
        EvalSuiteSchema(**data)
    except ValidationError as e:
        for error in e.errors():
            loc = ".".join(str(l) for l in error["loc"])
            errors.append(f"{loc}: {error['msg']}")

    # Additional validations
    if "cases" in data:
        for i, case in enumerate(data["cases"]):
            if "name" not in case:
                errors.append(f"cases[{i}]: missing required field 'name'")
            if "input" not in case:
                errors.append(f"cases[{i}]: missing required field 'input'")

            # Check for valid scorer names
            valid_scorers = {"tool_selection", "reasoning", "grounding", "efficiency", "custom"}
            if "scorers" in case:
                for scorer in case["scorers"]:
                    if scorer not in valid_scorers:
                        errors.append(
                            f"cases[{i}].scorers: unknown scorer '{scorer}'"
                        )

    return errors


def load_suites_from_dir(dir_path: Path) -> list[dict[str, Any]]:
    """Load all suites from a directory.

    Args:
        dir_path: Path to directory containing YAML files

    Returns:
        List of suite data dictionaries
    """
    suites = []
    for path in sorted(dir_path.glob("*.yaml")):
        try:
            suites.append(load_suite(path))
        except ValueError:
            continue  # Skip invalid files
    for path in sorted(dir_path.glob("*.yml")):
        try:
            suites.append(load_suite(path))
        except ValueError:
            continue
    return suites
