import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Connection } from "../types";

// ── Mocks ──────────────────────────────────────────────────

const mockConnections: Connection[] = [
  {
    id: "conn-1",
    name: "Dev PG",
    db_type: "postgresql",
    host: "localhost",
    port: 5432,
    database: "dev",
    username: "dev",
    ssl_enabled: false,
    has_ssl_certificates: false,
    has_ssl_ca: false,
    has_ssl_client_certificates: false,
    ssh_enabled: false,
    ssh_host: null,
    ssh_port: null,
    ssh_username: null,
    is_shared: false,
    max_concurrent_queries: 5,
    query_timeout_seconds: 30,
    safe_mode: false,
    dbml_context: null,
    created_by: "user-1",
    created_at: "",
    updated_at: "",
  },
  {
    id: "conn-2",
    name: "Staging CH",
    db_type: "clickhouse",
    host: "staging",
    port: 8123,
    database: "analytics",
    username: "ro",
    ssl_enabled: false,
    has_ssl_certificates: false,
    has_ssl_ca: false,
    has_ssl_client_certificates: false,
    ssh_enabled: false,
    ssh_host: null,
    ssh_port: null,
    ssh_username: null,
    is_shared: true,
    max_concurrent_queries: 3,
    query_timeout_seconds: 60,
    safe_mode: false,
    dbml_context: null,
    created_by: "user-1",
    created_at: "",
    updated_at: "",
  },
];

const clearForConnectionMock = vi.fn();

vi.mock("../services/connections-api", () => ({
  fetchConnections: vi.fn(() => Promise.resolve([...mockConnections])),
  deleteConnection: vi.fn(() => Promise.resolve()),
  updateConnection: vi.fn(() => Promise.resolve(mockConnections[0])),
  createConnection: vi.fn(() => Promise.resolve(mockConnections[0])),
}));

vi.mock("@/domains/schema/hooks/use-schema-store", () => ({
  useSchemaStore: {
    getState: () => ({ clearForConnection: clearForConnectionMock }),
  },
}));

// ── Helpers ────────────────────────────────────────────────

async function getStore() {
  const mod = await import("./use-connections-store");
  return mod.useConnectionsStore;
}

// ── Tests ──────────────────────────────────────────────────

describe("useConnectionsStore", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    clearForConnectionMock.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("auto-selects first connection when none is persisted", async () => {
    const store = await getStore();
    await store.getState().load();
    expect(store.getState().activeConnectionId).toBe("conn-1");
  });

  it("restores persisted activeConnectionId on creation", async () => {
    localStorage.setItem("codb:active-connection-id", "conn-2");
    const store = await getStore();
    // Before load, persisted value is used
    expect(store.getState().activeConnectionId).toBe("conn-2");
    await store.getState().load();
    // After load, still conn-2 because it exists
    expect(store.getState().activeConnectionId).toBe("conn-2");
  });

  it("clears persisted activeConnectionId if it no longer exists after load", async () => {
    localStorage.setItem("codb:active-connection-id", "deleted-conn");
    const store = await getStore();
    await store.getState().load();
    // Falls back to first available connection
    expect(store.getState().activeConnectionId).toBe("conn-1");
  });

  it("persists activeConnectionId to localStorage on setActive", async () => {
    const store = await getStore();
    await store.getState().load();
    store.getState().setActive("conn-2");
    expect(localStorage.getItem("codb:active-connection-id")).toBe("conn-2");
  });

  it("does not rewrite storage when setting the already-active connection", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const store = await getStore();
    await store.getState().load();

    setItemSpy.mockClear();
    store.getState().setActive("conn-1");

    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it("selects next connection after removing the active one", async () => {
    const store = await getStore();
    await store.getState().load();
    store.getState().setActive("conn-1");

    await store.getState().remove("conn-1");

    // Should pick conn-2 (next remaining), not null
    expect(store.getState().activeConnectionId).toBe("conn-2");
    expect(localStorage.getItem("codb:active-connection-id")).toBe("conn-2");
  });

  it("sets activeConnectionId to null when the last connection is removed", async () => {
    // Override mock to return single connection
    const connectionsApi = await import("../services/connections-api");
    vi.mocked(connectionsApi.fetchConnections)
      .mockResolvedValueOnce([mockConnections[0]!]) // initial load
      .mockResolvedValueOnce([]); // after remove

    const store = await getStore();
    await store.getState().load();
    store.getState().setActive("conn-1");

    await store.getState().remove("conn-1");
    expect(store.getState().activeConnectionId).toBeNull();
  });
});
