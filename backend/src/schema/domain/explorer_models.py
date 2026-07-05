"""Engine-neutral catalog exploration models."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from src.connections.drivers.base import (
    ColumnInfo,
    TableErdInfo,
    TableIndexInfo,
    TableMetadataPropertyInfo,
    TableRelationshipsInfo,
)

EngineKind = Literal["sql", "redis", "dynamodb"]
CatalogObjectKind = Literal["table", "key"]
ObjectSectionKind = Literal[
    "attributes",
    "properties",
    "indexes",
    "relationships",
    "erd",
    "snippets",
    "redis_key",
]


@dataclass(frozen=True, slots=True)
class PreviewOperationInfo:
    label: str
    language: str
    text: str
    write_mode_required: bool = False


@dataclass(frozen=True, slots=True)
class CatalogObjectInfo:
    id: str
    kind: CatalogObjectKind
    namespace: str
    name: str
    display_name: str
    data_type: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class CatalogObjectRef:
    engine: str
    kind: CatalogObjectKind
    namespace: str
    name: str


@dataclass(frozen=True, slots=True)
class ObjectSectionInfo:
    id: str
    title: str
    kind: ObjectSectionKind
    description: str | None = None
    columns: tuple[ColumnInfo, ...] = field(default_factory=tuple)
    indexes: tuple[TableIndexInfo, ...] = field(default_factory=tuple)
    properties: tuple[TableMetadataPropertyInfo, ...] = field(default_factory=tuple)
    relationships: TableRelationshipsInfo | None = None
    erd: TableErdInfo | None = None
    snippets: tuple[PreviewOperationInfo, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class ObjectDetailInfo:
    object: CatalogObjectInfo
    engine_kind: EngineKind
    sections: tuple[ObjectSectionInfo, ...]
    preview_operation: PreviewOperationInfo
