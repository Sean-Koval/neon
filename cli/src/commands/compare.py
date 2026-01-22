"""Compare runs commands."""

import json
import sys

import typer
from rich.console import Console
from rich.table import Table

from src.client import get_client

app = typer.Typer(help="Compare eval runs")
console = Console()


@app.command("runs")
def compare_runs(
    baseline: str = typer.Argument(..., help="Baseline run ID or 'latest'"),
    candidate: str = typer.Argument(..., help="Candidate run ID"),
    threshold: float = typer.Option(
        0.05, "--threshold", "-t", help="Regression threshold (0-1)"
    ),
    fail_on_regression: bool = typer.Option(
        False, "--fail-on-regression", "-f", help="Exit 1 if regressions found"
    ),
    output: str = typer.Option(
        "table", "--output", "-o", help="Output format: table, json, markdown"
    ),
    local: bool = typer.Option(
        False, "--local", "-l", help="Compare local runs"
    ),
):
    """Compare two eval runs and identify regressions.

    Examples:
        # Compare API runs
        agent-eval compare runs latest <candidate-id>

        # Compare local runs
        agent-eval compare runs <baseline-id> <candidate-id> --local
    """
    if local:
        _compare_local_runs(
            baseline=baseline,
            candidate=candidate,
            threshold=threshold,
            fail_on_regression=fail_on_regression,
            output=output,
        )
    else:
        _compare_api_runs(
            baseline=baseline,
            candidate=candidate,
            threshold=threshold,
            fail_on_regression=fail_on_regression,
            output=output,
        )


def _compare_local_runs(
    baseline: str,
    candidate: str,
    threshold: float,
    fail_on_regression: bool,
    output: str,
) -> None:
    """Compare local runs."""
    from src.local_runner import LocalDatabase, compare_local_runs

    db = LocalDatabase()

    # Resolve 'latest' to actual run ID
    if baseline == "latest":
        runs = db.list_runs(limit=2)
        if len(runs) < 2:
            console.print("[red]Not enough local runs to compare[/red]")
            raise typer.Exit(1)
        # Latest is at index 0, so baseline is the second most recent
        baseline = runs[1].id
        console.print(f"[dim]Using baseline: {baseline}[/dim]")

    with console.status("Comparing local runs..."):
        try:
            result = compare_local_runs(
                baseline_id=baseline,
                candidate_id=candidate,
                threshold=threshold,
                db=db,
            )
        except ValueError as e:
            console.print(f"[red]{e}[/red]")
            raise typer.Exit(1)

    if output == "json":
        console.print(json.dumps(result, indent=2, default=str))
    elif output == "markdown":
        _display_markdown(result)
    else:
        _display_table(result)

    # Exit with error if regressions found and flag is set
    if fail_on_regression and not result["passed"]:
        raise typer.Exit(1)


def _compare_api_runs(
    baseline: str,
    candidate: str,
    threshold: float,
    fail_on_regression: bool,
    output: str,
) -> None:
    """Compare API runs."""
    client = get_client()

    # Resolve 'latest' to actual run ID
    if baseline == "latest":
        runs = client.list_runs(limit=2)
        if len(runs) < 2:
            console.print("[red]Not enough runs to compare[/red]")
            raise typer.Exit(1)
        # Latest is at index 0, so baseline is the second most recent
        baseline = runs[1]["id"]
        console.print(f"[dim]Using baseline: {baseline}[/dim]")

    with console.status("Comparing runs..."):
        result = client.compare_runs(
            baseline_run_id=baseline,
            candidate_run_id=candidate,
            threshold=threshold,
        )

    if not result:
        console.print("[red]Failed to compare runs[/red]")
        raise typer.Exit(1)

    if output == "json":
        console.print(json.dumps(result, indent=2, default=str))
    elif output == "markdown":
        _display_markdown(result)
    else:
        _display_table(result)

    # Exit with error if regressions found and flag is set
    if fail_on_regression and not result["passed"]:
        raise typer.Exit(1)


def _display_table(result: dict):
    """Display comparison results as a table."""
    baseline = result["baseline"]
    candidate = result["candidate"]

    console.print(
        f"\n[bold]Comparing:[/bold] {baseline.get('agent_version', baseline['id'][:8])} "
        f"-> {candidate.get('agent_version', candidate['id'][:8])}"
    )

    status = "[green]PASSED[/green]" if result["passed"] else "[red]REGRESSION DETECTED[/red]"
    console.print(f"[bold]Status:[/bold] {status}")
    console.print(f"[bold]Overall delta:[/bold] {result['overall_delta']:+.4f}")
    console.print(f"[bold]Threshold:[/bold] {result['threshold']}")

    regressions = result.get("regressions", [])
    if regressions:
        console.print(f"\n[bold red]Regressions ({len(regressions)}):[/bold red]")
        table = Table(show_header=True, header_style="bold red")
        table.add_column("Case")
        table.add_column("Scorer")
        table.add_column("Baseline", justify="right")
        table.add_column("Candidate", justify="right")
        table.add_column("Delta", justify="right")

        for r in regressions:
            table.add_row(
                r["case_name"],
                r["scorer"],
                f"{r['baseline_score']:.2f}",
                f"{r['candidate_score']:.2f}",
                f"[red]{r['delta']:+.2f}[/red]",
            )

        console.print(table)

    improvements = result.get("improvements", [])
    if improvements:
        console.print(f"\n[bold green]Improvements ({len(improvements)}):[/bold green]")
        table = Table(show_header=True, header_style="bold green")
        table.add_column("Case")
        table.add_column("Scorer")
        table.add_column("Baseline", justify="right")
        table.add_column("Candidate", justify="right")
        table.add_column("Delta", justify="right")

        for i in improvements:
            table.add_row(
                i["case_name"],
                i["scorer"],
                f"{i['baseline_score']:.2f}",
                f"{i['candidate_score']:.2f}",
                f"[green]{i['delta']:+.2f}[/green]",
            )

        console.print(table)

    console.print(f"\n[dim]Unchanged: {result.get('unchanged', 0)} score(s)[/dim]")


def _display_markdown(result: dict):
    """Display comparison results as markdown."""
    baseline = result["baseline"]
    candidate = result["candidate"]

    print("## Agent Evaluation Comparison")
    print()
    print(
        f"**Baseline:** {baseline.get('agent_version', baseline['id'][:8])}"
    )
    print(
        f"**Candidate:** {candidate.get('agent_version', candidate['id'][:8])}"
    )
    print(f"**Status:** {'PASSED' if result['passed'] else 'REGRESSION DETECTED'}")
    print(f"**Overall Delta:** {result['overall_delta']:+.4f}")
    print()

    regressions = result.get("regressions", [])
    if regressions:
        print("### Regressions")
        print()
        print("| Case | Scorer | Baseline | Candidate | Delta |")
        print("|------|--------|----------|-----------|-------|")
        for r in regressions:
            print(
                f"| {r['case_name']} | {r['scorer']} | "
                f"{r['baseline_score']:.2f} | {r['candidate_score']:.2f} | "
                f"{r['delta']:+.2f} |"
            )
        print()

    improvements = result.get("improvements", [])
    if improvements:
        print("### Improvements")
        print()
        print("| Case | Scorer | Baseline | Candidate | Delta |")
        print("|------|--------|----------|-----------|-------|")
        for i in improvements:
            print(
                f"| {i['case_name']} | {i['scorer']} | "
                f"{i['baseline_score']:.2f} | {i['candidate_score']:.2f} | "
                f"{i['delta']:+.2f} |"
            )
        print()

    print(f"*Unchanged: {result.get('unchanged', 0)} score(s)*")
