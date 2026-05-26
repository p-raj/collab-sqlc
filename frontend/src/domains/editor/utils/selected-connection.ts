import type { DatabaseType } from "@/domains/connections/types";

interface ConnectionDialectLike {
    id: string;
    db_type: DatabaseType;
}

export function getSelectedConnectionId(
    activeTabConnectionId: string | null | undefined,
    activeConnectionId: string | null,
): string | null {
    return activeTabConnectionId ?? activeConnectionId;
}

export function getSelectedConnectionDbType(
    activeTabConnectionId: string | null | undefined,
    activeConnectionId: string | null,
    connections: readonly ConnectionDialectLike[],
): DatabaseType | undefined {
    const selectedConnectionId = getSelectedConnectionId(activeTabConnectionId, activeConnectionId);
    return connections.find((connection) => connection.id === selectedConnectionId)?.db_type;
}

export function shouldSyncActiveConnection(
    selectedConnectionId: string | null,
    activeConnectionId: string | null,
    availableConnectionIds: Iterable<string>,
): boolean {
    if (!selectedConnectionId || selectedConnectionId === activeConnectionId) {
        return false;
    }

    for (const connectionId of availableConnectionIds) {
        if (connectionId === selectedConnectionId) {
            return true;
        }
    }

    return false;
}

export function resolveConnectionOverride(
    connectionIdOverride: string | null | undefined,
    fallbackConnectionId: string | null,
): string | null {
    return connectionIdOverride ?? fallbackConnectionId;
}