"""Process helpers for CLI commands."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import typer

from cli.paths import DOCKER_DIR, ENV_EXAMPLE, ENV_FILE, ROOT_DIR


def run(args: list[str], cwd: Path = ROOT_DIR, env: dict[str, str] | None = None) -> None:
    process_env = os.environ.copy()
    if env:
        process_env.update(env)

    result = subprocess.run(args, cwd=cwd, env=process_env, check=False)
    if result.returncode != 0:
        raise typer.Exit(result.returncode)


def require_tool(name: str) -> bool:
    found = shutil.which(name) is not None
    marker = "OK" if found else "MISSING"
    typer.echo(f"{marker}  {name}")
    return found


def ensure_env_file() -> None:
    if ENV_FILE.exists():
        return
    if not ENV_EXAMPLE.exists():
        raise typer.BadParameter(".env.example is missing; cannot create .env")
    shutil.copyfile(ENV_EXAMPLE, ENV_FILE)
    typer.echo("Created .env from .env.example")


def compose_args(*args: str, dev: bool = False) -> list[str]:
    command = ["docker", "compose", "-f", "docker-compose.yml"]
    if dev:
        command.extend(["-f", "docker-compose.dev.yml"])
    command.extend(args)
    return command


def run_compose(*args: str, dev: bool = False) -> None:
    run(compose_args(*args, dev=dev), cwd=DOCKER_DIR)


def run_alembic(*args: str) -> None:
    from cli.paths import BACKEND_DIR

    run(["uv", "run", "alembic", *args], cwd=BACKEND_DIR)


def run_backend_python(script: str, env: dict[str, str] | None = None) -> None:
    from cli.paths import BACKEND_DIR

    run(["uv", "run", "python", "-c", script], cwd=BACKEND_DIR, env=env)
