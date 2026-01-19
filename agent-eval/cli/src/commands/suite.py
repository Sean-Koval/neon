"""Suite management commands."""

from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from src.client import get_client
from src.loader import load_suite, validate_suite

app = typer.Typer(help="Manage eval suites")
console = Console()


@app.command("list")
def list_suites():
    """List all eval suites."""
    client = get_client()

    with console.status("Fetching suites..."):
        suites = client.list_suites()

    if not suites:
        console.print("[yellow]No suites found[/yellow]")
        return

    table = Table(title="Eval Suites")
    table.add_column("Name", style="cyan")
    table.add_column("Agent ID", style="green")
    table.add_column("Cases", justify="right")
    table.add_column("Description")

    for suite in suites:
        table.add_row(
            suite["name"],
            suite["agent_id"],
            str(len(suite.get("cases", []))),
            (suite.get("description", "") or "")[:50],
        )

    console.print(table)


@app.command("show")
def show_suite(name: str = typer.Argument(..., help="Suite name")):
    """Show details of an eval suite."""
    client = get_client()

    with console.status(f"Fetching suite '{name}'..."):
        suite = client.get_suite_by_name(name)

    if not suite:
        console.print(f"[red]Suite not found: {name}[/red]")
        raise typer.Exit(1)

    console.print(f"\n[bold cyan]{suite['name']}[/bold cyan]")
    if suite.get("description"):
        console.print(f"[dim]{suite['description']}[/dim]")

    console.print(f"\n[bold]Agent ID:[/bold] {suite['agent_id']}")
    console.print(f"[bold]Default Scorers:[/bold] {', '.join(suite.get('default_scorers', []))}")
    console.print(f"[bold]Min Score:[/bold] {suite.get('default_min_score', 0.7)}")

    cases = suite.get("cases", [])
    if cases:
        console.print(f"\n[bold]Cases ({len(cases)}):[/bold]")
        for case in cases:
            tags = ", ".join(case.get("tags", []))
            console.print(
                f"  - {case['name']}: {case.get('description', 'No description')}"
                + (f" [dim][{tags}][/dim]" if tags else "")
            )


@app.command("create")
def create_suite(
    file: Path = typer.Argument(..., help="Path to YAML suite file"),
):
    """Create a new suite from YAML file."""
    if not file.exists():
        console.print(f"[red]File not found: {file}[/red]")
        raise typer.Exit(1)

    with console.status("Loading suite..."):
        suite_data = load_suite(file)

    client = get_client()

    with console.status("Creating suite..."):
        result = client.create_suite(suite_data)

    console.print(f"[green]Created suite: {result['name']}[/green]")
    console.print(f"  ID: {result['id']}")
    console.print(f"  Cases: {len(result.get('cases', []))}")


@app.command("validate")
def validate_suite_file(
    file: Path = typer.Argument(..., help="Path to YAML suite file"),
):
    """Validate a suite YAML file."""
    if not file.exists():
        console.print(f"[red]File not found: {file}[/red]")
        raise typer.Exit(1)

    errors = validate_suite(file)

    if errors:
        console.print(f"[red]Validation failed with {len(errors)} error(s):[/red]")
        for error in errors:
            console.print(f"  - {error}")
        raise typer.Exit(1)

    console.print(f"[green]Suite file is valid: {file}[/green]")


@app.command("delete")
def delete_suite(
    name: str = typer.Argument(..., help="Suite name"),
    force: bool = typer.Option(False, "--force", "-f", help="Skip confirmation"),
):
    """Delete an eval suite."""
    if not force:
        confirm = typer.confirm(f"Delete suite '{name}'?")
        if not confirm:
            raise typer.Abort()

    client = get_client()

    with console.status(f"Deleting suite '{name}'..."):
        success = client.delete_suite_by_name(name)

    if success:
        console.print(f"[green]Deleted suite: {name}[/green]")
    else:
        console.print(f"[red]Failed to delete suite: {name}[/red]")
        raise typer.Exit(1)
