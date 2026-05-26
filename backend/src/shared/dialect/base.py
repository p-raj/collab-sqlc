"""DialectProfile protocol — defines engine-specific safety rules."""

from __future__ import annotations

from typing import Protocol


class DialectProfile(Protocol):
    """Engine-specific safety metadata for SQL classification."""

    @property
    def id(self) -> str: ...

    @property
    def dangerous_functions(self) -> frozenset[str]: ...

    @property
    def read_only_prefixes(self) -> frozenset[str]: ...
