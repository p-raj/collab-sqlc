"""Alembic environment configuration for async SQLAlchemy."""

import asyncio
import os
from logging.config import fileConfig

from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

db_url = os.environ.get("DB_URL")
if db_url:
    config.set_main_option("sqlalchemy.url", db_url)

target_metadata = None  # Will import models when we have them

# Import all models so Alembic sees them
from src.admin.domain.app_settings_model import AppSettingModel  # noqa: E402, F401
from src.admin.domain.models import AuditLogModel  # noqa: E402, F401
from src.auth.domain.models import InviteModel, RefreshTokenModel, UserModel  # noqa: E402, F401
from src.connections.domain.models import ConnectionModel  # noqa: E402, F401
from src.history.domain.models import RunHistoryModel  # noqa: E402, F401
from src.queries.domain.models import (  # noqa: E402, F401
    QueryFolder,
    SavedQuery,
    SavedQueryFavorite,
    SavedQueryVersion,
)
from src.query_api.domain.models import APIExecutionData, APIExecutionLog  # noqa: E402, F401
from src.shared.domain.base_model import Base  # noqa: E402

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: object) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)  # type: ignore[arg-type]
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = create_async_engine(
        config.get_main_option("sqlalchemy.url", ""),
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
