"""CLI configuration management."""

import os
from pathlib import Path
from typing import Any

import yaml


def get_config_dir() -> Path:
    """Get the config directory path."""
    return Path.home() / ".agent-eval"


def get_config_file() -> Path:
    """Get the config file path."""
    return get_config_dir() / "config.yaml"


def get_config() -> dict[str, Any]:
    """Load configuration from file and environment."""
    config: dict[str, Any] = {}

    # Load from file if exists
    config_file = get_config_file()
    if config_file.exists():
        with open(config_file) as f:
            file_config = yaml.safe_load(f) or {}
            config.update(file_config)

    # Override with environment variables
    if os.environ.get("AGENT_EVAL_API_KEY"):
        config["api_key"] = os.environ["AGENT_EVAL_API_KEY"]
    if os.environ.get("AGENT_EVAL_API_URL"):
        config["api_url"] = os.environ["AGENT_EVAL_API_URL"]

    return config


def save_config(config: dict[str, Any]) -> None:
    """Save configuration to file."""
    config_dir = get_config_dir()
    config_dir.mkdir(parents=True, exist_ok=True)

    config_file = get_config_file()
    with open(config_file, "w") as f:
        yaml.dump(config, f, default_flow_style=False)

    # Set restrictive permissions
    config_file.chmod(0o600)
