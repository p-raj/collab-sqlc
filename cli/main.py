"""Typer application entry point."""

from __future__ import annotations

import typer

from cli.commands import core
from cli.commands.migrations import app as migrate_app
from cli.commands.users import app as users_app

app = typer.Typer(
    help="Collab SQLC development and deployment CLI.",
    no_args_is_help=True,
    add_completion=False,
)

core.register(app)
app.add_typer(migrate_app, name="migrate")
app.add_typer(users_app, name="users")


def main() -> None:
    app()
