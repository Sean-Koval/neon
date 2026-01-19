"""Authentication commands."""

import typer
from rich.console import Console
from rich.table import Table

from src.client import get_client
from src.config import get_config, save_config

app = typer.Typer(help="Authentication management")
console = Console()


@app.command("login")
def login(
    api_key: str = typer.Option(
        ..., "--api-key", "-k", prompt=True, hide_input=True, help="API key"
    ),
    api_url: str = typer.Option(
        "https://api.agent-eval.example.com",
        "--api-url",
        "-u",
        help="API URL",
    ),
):
    """Configure API credentials."""
    # Verify the key works
    from src.client import Client

    client = Client(api_url=api_url, api_key=api_key)

    try:
        # Try a simple request to verify credentials
        client.list_suites()
        console.print("[green]Credentials verified successfully[/green]")
    except Exception as e:
        console.print(f"[red]Failed to verify credentials: {e}[/red]")
        raise typer.Exit(1)

    # Save to config
    config = get_config()
    config["api_key"] = api_key
    config["api_url"] = api_url
    save_config(config)

    console.print(f"[green]Credentials saved to config file[/green]")


@app.command("logout")
def logout():
    """Remove saved credentials."""
    config = get_config()
    config.pop("api_key", None)
    save_config(config)
    console.print("[green]Credentials removed[/green]")


@app.command("status")
def status():
    """Show current authentication status."""
    config = get_config()

    if "api_key" in config:
        # Mask the key
        key = config["api_key"]
        masked = key[:12] + "..." + key[-4:] if len(key) > 16 else "****"
        console.print(f"[green]Authenticated[/green]")
        console.print(f"  API URL: {config.get('api_url', 'Not set')}")
        console.print(f"  API Key: {masked}")
    else:
        console.print("[yellow]Not authenticated[/yellow]")
        console.print("  Run: agent-eval auth login")


@app.command("api-key")
def manage_api_keys(
    action: str = typer.Argument(..., help="Action: list, create, revoke"),
    name: str = typer.Option(None, "--name", "-n", help="Key name (for create)"),
    key_id: str = typer.Option(None, "--id", help="Key ID (for revoke)"),
):
    """Manage API keys."""
    client = get_client()

    if action == "list":
        with console.status("Fetching API keys..."):
            keys = client.list_api_keys()

        if not keys:
            console.print("[yellow]No API keys found[/yellow]")
            return

        table = Table(title="API Keys")
        table.add_column("ID", style="cyan", max_width=12)
        table.add_column("Name", style="green")
        table.add_column("Prefix")
        table.add_column("Scopes")
        table.add_column("Last Used")
        table.add_column("Status")

        for key in keys:
            status_style = "green" if key["is_active"] else "red"
            table.add_row(
                key["id"][:12],
                key["name"],
                key["key_prefix"],
                ", ".join(key.get("scopes", [])),
                key.get("last_used_at", "Never")[:16] if key.get("last_used_at") else "Never",
                f"[{status_style}]{'Active' if key['is_active'] else 'Revoked'}[/{status_style}]",
            )

        console.print(table)

    elif action == "create":
        if not name:
            name = typer.prompt("Key name")

        with console.status("Creating API key..."):
            result = client.create_api_key(name=name)

        console.print(f"\n[green]API key created successfully![/green]")
        console.print(f"\n[bold red]Save this key - it won't be shown again:[/bold red]")
        console.print(f"\n  {result['key']}\n")
        console.print(f"Key ID: {result['id']}")
        console.print(f"Prefix: {result['key_prefix']}")

    elif action == "revoke":
        if not key_id:
            key_id = typer.prompt("Key ID to revoke")

        confirm = typer.confirm(f"Revoke key {key_id}?")
        if not confirm:
            raise typer.Abort()

        with console.status("Revoking API key..."):
            success = client.revoke_api_key(key_id)

        if success:
            console.print(f"[green]API key revoked: {key_id}[/green]")
        else:
            console.print(f"[red]Failed to revoke key: {key_id}[/red]")
            raise typer.Exit(1)

    else:
        console.print(f"[red]Unknown action: {action}[/red]")
        console.print("Valid actions: list, create, revoke")
        raise typer.Exit(1)
