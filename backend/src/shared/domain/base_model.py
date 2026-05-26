"""SQLAlchemy DeclarativeBase — shared infrastructure for all domain models."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
