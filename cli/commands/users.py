"""User management commands."""

from __future__ import annotations

import secrets
import string

import typer

from cli.process import run_backend_python

app = typer.Typer(help="Manage application users.", no_args_is_help=True)

USER_SCRIPT = r'''
import asyncio
import os
import sys

from argon2 import PasswordHasher
from sqlalchemy import select

from src.auth.domain.models import UserModel
from src.shared.config import get_settings
from src.shared.database import close_engine, get_session_factory, init_engine
from src.shared.domain.base import new_id, utc_now


async def main() -> None:
    action = os.environ["USER_ACTION"]
    settings = get_settings()
    init_engine(settings)
    factory = get_session_factory()
    hasher = PasswordHasher()

    try:
        async with factory() as session:
            if action == "list":
                result = await session.execute(select(UserModel).order_by(UserModel.created_at.desc()))
                users = list(result.scalars().all())
                if not users:
                    print("No users found.")
                    return
                print("EMAIL\tROLE\tACTIVE\tDISPLAY NAME")
                for user in users:
                    print(f"{user.email}\t{user.role}\t{user.is_active}\t{user.display_name}")
                return

            email = os.environ["USER_EMAIL"]
            result = await session.execute(select(UserModel).where(UserModel.email == email))
            user = result.scalar_one_or_none()

            if action == "create_admin":
                if user is not None:
                    print(f"User with email {email} already exists.")
                    sys.exit(1)
                user = UserModel(
                    id=new_id(),
                    email=email,
                    display_name=os.environ["USER_DISPLAY_NAME"],
                    password_hash=hasher.hash(os.environ["USER_PASSWORD"]),
                    secret_key=os.environ["USER_SECRET_KEY"],
                    role="admin",
                    is_active=True,
                    created_at=utc_now(),
                    updated_at=utc_now(),
                )
                session.add(user)
                await session.commit()
                print(f"Admin user created: {email}")
                return

            if user is None:
                print(f"No user found with email: {email}")
                sys.exit(1)

            if action == "set_credentials":
                user.password_hash = hasher.hash(os.environ["USER_PASSWORD"])
                user.secret_key = os.environ["USER_SECRET_KEY"]
            elif action == "reset_credentials":
                user.password_hash = hasher.hash(os.environ["USER_PASSWORD"])
                user.secret_key = os.environ["USER_SECRET_KEY"]
            elif action == "set_role":
                user.role = os.environ["USER_ROLE"]
            elif action == "activate":
                user.is_active = True
            elif action == "deactivate":
                user.is_active = False
            else:
                print(f"Unknown user action: {action}")
                sys.exit(1)

            user.updated_at = utc_now()
            await session.commit()
            print(f"Updated user: {email}")
            print(f"Role: {user.role}")
            print(f"Active: {user.is_active}")
    finally:
        await close_engine()


asyncio.run(main())
'''


def _generate_secret_key() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(12))


def _generate_password() -> str:
    alphabet = string.ascii_letters + string.digits + "!@#%&*"
    return "".join(secrets.choice(alphabet) for _ in range(20))


@app.command("list")
def list_users() -> None:
    """List application users."""
    run_backend_python(USER_SCRIPT, {"USER_ACTION": "list"})


@app.command("create-admin")
def create_admin(
    email: str = typer.Option(..., prompt=True, help="Admin email address"),
    display_name: str = typer.Option(..., prompt=True, help="Admin display name"),
    password: str | None = typer.Option(None, help="Password to set; generated when omitted"),
    secret_key: str | None = typer.Option(None, help="Secret key to set; generated when omitted"),
) -> None:
    """Create an admin user."""
    generated_password = password or _generate_password()
    generated_secret_key = secret_key or _generate_secret_key()
    run_backend_python(
        USER_SCRIPT,
        {
            "USER_ACTION": "create_admin",
            "USER_EMAIL": email,
            "USER_DISPLAY_NAME": display_name,
            "USER_PASSWORD": generated_password,
            "USER_SECRET_KEY": generated_secret_key,
        },
    )
    typer.echo(f"Password:   {generated_password}")
    typer.echo(f"Secret key: {generated_secret_key}")


@app.command("set-credentials")
def set_credentials(email: str = typer.Option(..., prompt=True, help="User email address")) -> None:
    """Set a user's password and secret key."""
    password = typer.prompt("Password", hide_input=True, confirmation_prompt=True)
    if len(password) < 8:
        raise typer.BadParameter("Password must be at least 8 characters")
    secret_key = typer.prompt("Secret key", hide_input=True)
    if len(secret_key) < 8:
        raise typer.BadParameter("Secret key must be at least 8 characters")
    run_backend_python(
        USER_SCRIPT,
        {
            "USER_ACTION": "set_credentials",
            "USER_EMAIL": email,
            "USER_PASSWORD": password,
            "USER_SECRET_KEY": secret_key,
        },
    )


@app.command("reset-credentials")
def reset_credentials(email: str = typer.Option(..., prompt=True, help="User email address")) -> None:
    """Reset a user's password and secret key to generated values."""
    password = _generate_password()
    secret_key = _generate_secret_key()
    run_backend_python(
        USER_SCRIPT,
        {
            "USER_ACTION": "reset_credentials",
            "USER_EMAIL": email,
            "USER_PASSWORD": password,
            "USER_SECRET_KEY": secret_key,
        },
    )
    typer.echo(f"Password:       {password}")
    typer.echo(f"New secret key: {secret_key}")


@app.command("set-role")
def set_role(
    email: str = typer.Option(..., prompt=True, help="User email address"),
    role: str = typer.Argument(..., help="Role: admin, editor, or viewer"),
) -> None:
    """Set a user's role."""
    if role not in {"admin", "editor", "viewer"}:
        raise typer.BadParameter("Role must be one of: admin, editor, viewer")
    run_backend_python(
        USER_SCRIPT,
        {"USER_ACTION": "set_role", "USER_EMAIL": email, "USER_ROLE": role},
    )


@app.command("activate")
def activate(email: str = typer.Option(..., prompt=True, help="User email address")) -> None:
    """Activate a user."""
    run_backend_python(USER_SCRIPT, {"USER_ACTION": "activate", "USER_EMAIL": email})


@app.command("deactivate")
def deactivate(email: str = typer.Option(..., prompt=True, help="User email address")) -> None:
    """Deactivate a user."""
    run_backend_python(USER_SCRIPT, {"USER_ACTION": "deactivate", "USER_EMAIL": email})
