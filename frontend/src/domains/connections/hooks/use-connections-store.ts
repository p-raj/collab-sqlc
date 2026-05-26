import { create } from "zustand";
import type { Connection, ConnectionCreateRequest, ConnectionUpdateRequest } from "../types";
import * as connectionsApi from "../services/connections-api";
import { useSchemaStore } from "@/domains/schema/hooks/use-schema-store";

const ACTIVE_CONNECTION_KEY = "codb:active-connection-id";

function loadPersistedActiveConnectionId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CONNECTION_KEY);
  } catch {
    return null;
  }
}

function persistActiveConnectionId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_CONNECTION_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_CONNECTION_KEY);
    }
  } catch {
    // Storage unavailable — silently ignore
  }
}

interface ConnectionsState {
  connections: Connection[];
  activeConnectionId: string | null;
  isLoading: boolean;

  load: () => Promise<void>;
  setActive: (id: string) => void;
  getActive: () => Connection | null;
  create: (data: ConnectionCreateRequest) => Promise<Connection>;
  update: (id: string, data: ConnectionUpdateRequest) => Promise<Connection>;
  remove: (id: string) => Promise<void>;
}

export const useConnectionsStore = create<ConnectionsState>((set, get) => ({
  connections: [],
  activeConnectionId: loadPersistedActiveConnectionId(),
  isLoading: false,

  load: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const connections = await connectionsApi.fetchConnections();
      const connectionIds = new Set(connections.map((c) => c.id));
      let { activeConnectionId } = get();

      // Validate persisted selection still exists
      if (activeConnectionId && !connectionIds.has(activeConnectionId)) {
        activeConnectionId = null;
      }

      // Auto-select first only when nothing is active
      if (!activeConnectionId && connections.length > 0) {
        activeConnectionId = connections[0]!.id;
      }

      persistActiveConnectionId(activeConnectionId);
      set({ connections, activeConnectionId, isLoading: false });
    } catch {
      set({ connections: [], isLoading: false });
    }
  },

  setActive: (id) => {
    if (get().activeConnectionId === id) {
      return;
    }
    persistActiveConnectionId(id);
    set({ activeConnectionId: id });
  },

  getActive: () => {
    const { connections, activeConnectionId } = get();
    return connections.find((c) => c.id === activeConnectionId) ?? null;
  },

  create: async (data) => {
    const conn = await connectionsApi.createConnection(data);
    await get().load();
    return conn;
  },

  update: async (id, data) => {
    const conn = await connectionsApi.updateConnection(id, data);
    useSchemaStore.getState().clearForConnection(id);
    await get().load();
    return conn;
  },

  remove: async (id) => {
    await connectionsApi.deleteConnection(id);
    useSchemaStore.getState().clearForConnection(id);
    const { activeConnectionId, connections } = get();
    if (activeConnectionId === id) {
      // Pick the next available connection instead of null
      const remaining = connections.filter((c) => c.id !== id);
      const nextId = remaining.length > 0 ? remaining[0]!.id : null;
      persistActiveConnectionId(nextId);
      set({ activeConnectionId: nextId });
    }
    await get().load();
  },
}));
