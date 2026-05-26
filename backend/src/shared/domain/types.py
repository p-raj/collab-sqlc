"""Shared domain types — enums and literals used across all domains."""

from enum import StrEnum
from typing import Literal


class UserRole(StrEnum):
    ADMIN = "admin"
    EDITOR = "editor"
    VIEWER = "viewer"


UserRoleLiteral = Literal["admin", "editor", "viewer"]
