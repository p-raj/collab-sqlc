"""Structured logging configuration using loguru."""

from __future__ import annotations

import logging
import sys

from loguru import logger


def setup_logging(debug: bool = False) -> None:
    logger.remove()

    level = "DEBUG" if debug else "INFO"

    logger.add(
        sys.stdout,
        level=level,
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level:<8} | {name}:{function}:{line} | {message}",
        serialize=False,
        backtrace=True,
        diagnose=debug,
    )

    # Intercept stdlib logging → loguru so uvicorn/sqlalchemy logs also go through loguru
    class _InterceptHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            try:
                loglevel = logger.level(record.levelname).name
            except ValueError:
                loglevel = str(record.levelno)
            logger.opt(depth=6, exception=record.exc_info).log(loglevel, record.getMessage())

    logging.basicConfig(handlers=[_InterceptHandler()], level=0, force=True)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
