"""Run evaluation commands."""

import subprocess
import sys
from pathlib import Path

import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

from src.client import get_client
from src.loader import load_suite

app = typer.Typer(help="Run evaluations")
console = Console()


@app.command("start")
def start_run(
    suite: str = typer.Argument(..., help="Suite name or path to YAML file"),
    agent: str = typer.Option(
        None, "--agent", "-a", help="Agent module path (e.g., myagent:run)"
    ),
    agent_version: str = typer.Option(
        None, "--agent-version", "-v", help="Agent version (default: git SHA)"
    ),
    parallel: bool = typer.Option(True, "--parallel/--no-parallel", help="Run cases in parallel"),
    timeout: int = typer.Option(
        None, "--timeout", "-t", help="Override default timeout (seconds)"
    ),
    output: str = typer.Option(
        "table", "--output", "-o", help="Output format: table, json, quiet"
    ),
):
    """Run an evaluation suite."""
    client = get_client()

    # Determine if suite is a file or name
    suite_path = Path(suite)
    if suite_path.exists() and suite_path.suffix in (".yaml", ".yml"):
        # Load from file and upload
        console.print(f"[dim]Loading suite from {suite_path}...[/dim]")
        suite_data = load_suite(suite_path)
        # Create or update suite
        result = client.create_suite(suite_data)
        suite_id = result["id"]
        suite_name = result["name"]
    else:
        # Get existing suite by name
        suite_info = client.get_suite_by_name(suite)
        if not suite_info:
            console.print(f"[red]Suite not found: {suite}[/red]")
            raise typer.Exit(1)
        suite_id = suite_info["id"]
        suite_name = suite_info["name"]

    # Get agent version from git if not specified
    if not agent_version:
        agent_version = _get_git_sha()

    # Start the run
    config = {}
    if not parallel:
        config["parallel"] = False
    if timeout:
        config["timeout_override"] = timeout

    with console.status(f"Starting eval run for '{suite_name}'..."):
        run_result = client.start_run(
            suite_id=suite_id,
            agent_version=agent_version,
            trigger="cli",
            config=config if config else None,
        )

    run_id = run_result["id"]
    console.print(f"\n[bold]Run started:[/bold] {run_id}")
    console.print(f"[bold]Suite:[/bold] {suite_name}")
    console.print(f"[bold]Agent version:[/bold] {agent_version or 'unknown'}")

    # Poll for completion
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Running evaluation...", total=None)

        while True:
            run_status = client.get_run(run_id)
            status = run_status["status"]

            if status in ("completed", "failed", "cancelled"):
                break

            import time

            time.sleep(2)

    # Display results
    if output == "json":
        import json

        console.print(json.dumps(run_status, indent=2, default=str))
    elif output == "quiet":
        summary = run_status.get("summary", {})
        passed = summary.get("passed", 0) == summary.get("total_cases", 0)
        raise typer.Exit(0 if passed else 1)
    else:
        _display_run_results(run_status)


@app.command("list")
def list_runs(
    suite: str = typer.Option(None, "--suite", "-s", help="Filter by suite name"),
    status: str = typer.Option(None, "--status", help="Filter by status"),
    limit: int = typer.Option(20, "--limit", "-n", help="Number of runs to show"),
):
    """List recent eval runs."""
    client = get_client()

    suite_id = None
    if suite:
        suite_info = client.get_suite_by_name(suite)
        if suite_info:
            suite_id = suite_info["id"]

    with console.status("Fetching runs..."):
        runs = client.list_runs(suite_id=suite_id, status=status, limit=limit)

    if not runs:
        console.print("[yellow]No runs found[/yellow]")
        return

    table = Table(title="Eval Runs")
    table.add_column("ID", style="cyan", max_width=12)
    table.add_column("Suite", style="green")
    table.add_column("Version", max_width=10)
    table.add_column("Status")
    table.add_column("Passed", justify="right")
    table.add_column("Score", justify="right")
    table.add_column("Time")

    for run in runs:
        summary = run.get("summary", {})
        status_style = {
            "completed": "green",
            "failed": "red",
            "running": "yellow",
            "pending": "dim",
            "cancelled": "dim",
        }.get(run["status"], "white")

        table.add_row(
            run["id"][:12],
            run.get("suite_name", "unknown"),
            (run.get("agent_version") or "")[:10],
            f"[{status_style}]{run['status']}[/{status_style}]",
            f"{summary.get('passed', '-')}/{summary.get('total_cases', '-')}",
            f"{summary.get('avg_score', 0):.2f}" if summary.get("avg_score") else "-",
            run.get("created_at", "")[:16] if run.get("created_at") else "-",
        )

    console.print(table)


@app.command("show")
def show_run(
    run_id: str = typer.Argument(..., help="Run ID"),
    details: bool = typer.Option(False, "--details", "-d", help="Show score details"),
    failed_only: bool = typer.Option(
        False, "--failed-only", "-f", help="Only show failed cases"
    ),
):
    """Show details of an eval run."""
    client = get_client()

    with console.status(f"Fetching run {run_id}..."):
        run = client.get_run(run_id)
        results = client.get_run_results(run_id, failed_only=failed_only)

    if not run:
        console.print(f"[red]Run not found: {run_id}[/red]")
        raise typer.Exit(1)

    _display_run_results(run, results, show_details=details)


def _display_run_results(run: dict, results: list | None = None, show_details: bool = False):
    """Display run results in a formatted table."""
    summary = run.get("summary", {})

    console.print(f"\n[bold]Run ID:[/bold] {run['id']}")
    console.print(f"[bold]Suite:[/bold] {run.get('suite_name', 'unknown')}")
    console.print(f"[bold]Status:[/bold] {run['status']}")
    console.print(f"[bold]Agent Version:[/bold] {run.get('agent_version', 'unknown')}")

    if summary:
        console.print(f"\n[bold]Summary:[/bold]")
        console.print(f"  Total cases: {summary.get('total_cases', 0)}")
        console.print(f"  Passed: [green]{summary.get('passed', 0)}[/green]")
        console.print(f"  Failed: [red]{summary.get('failed', 0)}[/red]")
        console.print(f"  Average score: {summary.get('avg_score', 0):.2f}")

        scores_by_type = summary.get("scores_by_type", {})
        if scores_by_type:
            console.print(f"\n[bold]Scores by type:[/bold]")
            for scorer, score in scores_by_type.items():
                console.print(f"  {scorer}: {score:.2f}")

    if results:
        console.print(f"\n[bold]Results:[/bold]")
        for result in results:
            status_icon = "[green]\u2713[/green]" if result["passed"] else "[red]\u2717[/red]"
            avg_score = (
                sum(result["scores"].values()) / len(result["scores"])
                if result["scores"]
                else 0
            )
            console.print(
                f"  {status_icon} {result['case_name']}: "
                f"[{'green' if result['passed'] else 'red'}]{avg_score:.2f}[/]"
            )

            if show_details and result.get("score_details"):
                for scorer, detail in result["score_details"].items():
                    console.print(f"      {scorer}: {detail.get('reason', 'N/A')}")


def _get_git_sha() -> str | None:
    """Get current git SHA."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except Exception:
        return None
