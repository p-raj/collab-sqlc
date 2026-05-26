"""Core project orchestration commands."""

from __future__ import annotations

import os
import subprocess

import typer

from cli.paths import BACKEND_DIR, FRONTEND_DIR, ROOT_DIR
from cli.process import ensure_env_file, require_tool, run, run_compose


def register(app: typer.Typer) -> None:
    @app.command()
    def init() -> None:
        """Install dependencies and create the local .env file."""
        ensure_env_file()
        run(["uv", "sync", "--all-extras"], cwd=BACKEND_DIR)
        run(["npm", "install"], cwd=FRONTEND_DIR)
        typer.echo("Project initialized")

    @app.command()
    def doctor() -> None:
        """Check required local tools."""
        required_tools = ["python3", "uv", "node", "npm", "docker"]
        tool_results = [require_tool(tool) for tool in required_tools]
        all_found = all(tool_results)

        compose = subprocess.run(
            ["docker", "compose", "version"],
            cwd=ROOT_DIR,
            check=False,
            capture_output=True,
            text=True,
        )
        if compose.returncode == 0:
            typer.echo(f"OK  {compose.stdout.strip()}")
        else:
            typer.echo("MISSING  docker compose")
            all_found = False

        if not all_found:
            raise typer.Exit(1)

    @app.command()
    def start() -> None:
        """Start the full development stack with hot reload."""
        ensure_env_file()
        run_compose("up", "--build", dev=True)

    @app.command("start:infra")
    def start_infra() -> None:
        """Start only PostgreSQL and Redis."""
        ensure_env_file()
        run_compose("up", "-d", "db", "redis")

    @app.command("start:backend")
    def start_backend() -> None:
        """Start the backend development server."""
        run(
            [
                "uv",
                "run",
                "uvicorn",
                "src.app:create_app",
                "--factory",
                "--host",
                "0.0.0.0",
                "--port",
                os.environ.get("BACKEND_PORT", "8000"),
                "--reload",
            ],
            cwd=BACKEND_DIR,
        )

    @app.command("start:frontend")
    def start_frontend() -> None:
        """Start the frontend development server."""
        run(["npm", "run", "dev", "--", "--host"], cwd=FRONTEND_DIR)

    @app.command()
    def stop() -> None:
        """Stop Docker services."""
        run_compose("down")

    @app.command()
    def logs(service: str | None = typer.Argument(None, help="Optional service name")) -> None:
        """Tail Docker service logs."""
        args = ["logs", "-f"]
        if service:
            args.append(service)
        run_compose(*args)

    @app.command()
    def test() -> None:
        """Run backend and frontend tests."""
        test_backend()
        test_frontend()

    @app.command("test:backend")
    def test_backend() -> None:
        """Run backend tests."""
        run(["uv", "run", "pytest"], cwd=BACKEND_DIR)

    @app.command("test:frontend")
    def test_frontend() -> None:
        """Run frontend tests."""
        run(["npm", "run", "test", "--", "run"], cwd=FRONTEND_DIR)

    @app.command()
    def lint() -> None:
        """Lint backend and frontend source."""
        run(["uv", "run", "ruff", "check", "src", "tests"], cwd=BACKEND_DIR)
        run(["npx", "oxlint", "src/"], cwd=FRONTEND_DIR)

    @app.command("lint:fix")
    def lint_fix() -> None:
        """Lint and auto-fix backend and frontend source."""
        run(["uv", "run", "ruff", "check", "--fix", "src", "tests"], cwd=BACKEND_DIR)
        run(["npx", "oxlint", "--fix", "src/"], cwd=FRONTEND_DIR)

    @app.command()
    def fmt() -> None:
        """Format backend and frontend source."""
        run(["uv", "run", "ruff", "format", "src", "tests"], cwd=BACKEND_DIR)
        run(["npx", "oxfmt", "src/"], cwd=FRONTEND_DIR)

    @app.command("fmt:check")
    def fmt_check() -> None:
        """Check backend and frontend formatting."""
        run(["uv", "run", "ruff", "format", "--check", "src", "tests"], cwd=BACKEND_DIR)
        run(["npx", "oxfmt", "--check", "src/"], cwd=FRONTEND_DIR)

    @app.command()
    def typecheck() -> None:
        """Run backend and frontend type checks."""
        run(["uv", "run", "mypy", "src/", "--ignore-missing-imports"], cwd=BACKEND_DIR)
        run(["npx", "tsc", "--noEmit"], cwd=FRONTEND_DIR)

    @app.command()
    def check() -> None:
        """Run lint, format, and type checks."""
        lint()
        fmt_check()
        typecheck()

    @app.command()
    def build() -> None:
        """Build backend and frontend artifacts."""
        run(["uv", "build"], cwd=BACKEND_DIR)
        run(["npm", "run", "build"], cwd=FRONTEND_DIR)

    @app.command()
    def deploy() -> None:
        """Build and start the production Docker stack."""
        ensure_env_file()
        run_compose("up", "-d", "--build")

    @app.command("deploy:down")
    def deploy_down() -> None:
        """Stop the production Docker stack."""
        run_compose("down")

    @app.command("deploy:ps")
    def deploy_ps() -> None:
        """Show production Docker service status."""
        run_compose("ps")
