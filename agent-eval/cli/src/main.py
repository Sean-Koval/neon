"""AgentEval CLI - Main entry point."""

import typer
from rich.console import Console

from src.commands import auth, compare, run, suite

app = typer.Typer(
    name="agent-eval",
    help="Agent evaluation CLI - Test, compare, and gate your AI agents",
    no_args_is_help=True,
)

console = Console()

# Add command groups
app.add_typer(suite.app, name="suite", help="Manage eval suites")
app.add_typer(run.app, name="run", help="Run evaluations")
app.add_typer(compare.app, name="compare", help="Compare runs")
app.add_typer(auth.app, name="auth", help="Authentication management")


@app.command()
def version():
    """Show version information."""
    from src import __version__

    console.print(f"agent-eval version {__version__}")


@app.command()
def init(
    path: str = typer.Argument(".", help="Directory to initialize"),
):
    """Initialize AgentEval in the current directory."""
    from pathlib import Path

    target = Path(path)
    suites_dir = target / "eval-suites"

    if suites_dir.exists():
        console.print(f"[yellow]Directory already initialized: {suites_dir}[/yellow]")
        return

    suites_dir.mkdir(parents=True, exist_ok=True)

    # Create example suite
    example_suite = suites_dir / "example.yaml"
    example_suite.write_text(
        """\
# Example eval suite
# Docs: https://agent-eval.example.com/docs/test-suites

name: example
description: Example evaluation suite
agent_id: my-agent

default_scorers:
  - tool_selection
  - reasoning
  - grounding

default_min_score: 0.7

cases:
  - name: simple_query
    description: Test basic question answering
    input:
      query: "What is the capital of France?"
    expected_output_contains:
      - "Paris"
    min_score: 0.8
    tags:
      - basic
      - geography

  - name: tool_usage
    description: Test that agent uses search tool
    input:
      query: "What is the current weather in Tokyo?"
    expected_tools:
      - web_search
    min_score: 0.7
    tags:
      - tools
      - weather
"""
    )

    console.print(f"[green]Initialized AgentEval in {target}[/green]")
    console.print(f"  Created: {suites_dir}/")
    console.print(f"  Created: {example_suite}")
    console.print("\n[dim]Next steps:[/dim]")
    console.print("  1. Edit eval-suites/example.yaml")
    console.print("  2. Run: agent-eval run example")


if __name__ == "__main__":
    app()
