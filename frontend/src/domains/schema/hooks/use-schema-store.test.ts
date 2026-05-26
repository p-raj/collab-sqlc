import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schemaApi from "../services/schema-api";
import { useSchemaStore } from "./use-schema-store";

vi.mock("../services/schema-api", () => ({
  fetchSchema: vi.fn(() =>
    Promise.resolve({
      connection_id: "conn-1",
      tables: [
        {
          schema_name: "public",
          table_name: "users",
          columns: [],
          comment: null,
          row_count: null,
        },
      ],
      cached: false,
    }),
  ),
  fetchTableDetail: vi.fn(() =>
    Promise.resolve({
      connection_id: "conn-1",
      schema_name: "public",
      table_name: "users",
      table: {
        schema_name: "public",
        table_name: "users",
        columns: [],
        row_count: null,
        comment: null,
      },
      relationships: { outgoing: [], incoming: [] },
      metadata: { indexes: [], constraints: [], enums: [], properties: [] },
      erd: { focus_table_key: "public.users", tables: [], edges: [] },
      cached: false,
    }),
  ),
}));

describe("useSchemaStore", () => {
  beforeEach(() => {
    useSchemaStore.getState().clear();
    vi.clearAllMocks();
  });

  it("caches schema data by connection id", async () => {
    await useSchemaStore.getState().fetchSchema("conn-1");
    expect(useSchemaStore.getState().getTables("conn-1")).toHaveLength(1);
    expect(useSchemaStore.getState().getTables("conn-1")[0]?.table_name).toBe("users");
  });

  it("returns empty array for unknown connection", () => {
    expect(useSchemaStore.getState().getTables("unknown")).toEqual([]);
  });

  it("clearForConnection removes only the targeted connection cache", async () => {
    await useSchemaStore.getState().fetchSchema("conn-1");
    await useSchemaStore.getState().fetchSchema("conn-2");

    useSchemaStore.getState().clearForConnection("conn-1");

    expect(useSchemaStore.getState().getTables("conn-1")).toEqual([]);
    expect(useSchemaStore.getState().getTables("conn-2")).toHaveLength(1);
  });

  it("caches table detail data by connection and table key", async () => {
    const fetchTableDetailMock = vi.mocked(schemaApi.fetchTableDetail);

    await useSchemaStore.getState().fetchTableDetail("conn-1", "public", "users");
    await useSchemaStore.getState().fetchTableDetail("conn-1", "public", "users");

    expect(fetchTableDetailMock).toHaveBeenCalledTimes(1);
    expect(
      useSchemaStore.getState().getTableDetail("conn-1", "public", "users")?.table.table_name,
    ).toBe("users");
  });

  it("clearForConnection removes cached table details for that connection only", async () => {
    await useSchemaStore.getState().fetchTableDetail("conn-1", "public", "users");
    await useSchemaStore.getState().fetchTableDetail("conn-2", "public", "users");

    useSchemaStore.getState().clearForConnection("conn-1");

    expect(useSchemaStore.getState().getTableDetail("conn-1", "public", "users")).toBeNull();
    expect(useSchemaStore.getState().getTableDetail("conn-2", "public", "users")).not.toBeNull();
  });

  it("clear removes all cached schemas", async () => {
    await useSchemaStore.getState().fetchSchema("conn-1");
    await useSchemaStore.getState().fetchSchema("conn-2");
    await useSchemaStore.getState().fetchTableDetail("conn-1", "public", "users");

    useSchemaStore.getState().clear();

    expect(useSchemaStore.getState().getTables("conn-1")).toEqual([]);
    expect(useSchemaStore.getState().getTables("conn-2")).toEqual([]);
    expect(useSchemaStore.getState().getTableDetail("conn-1", "public", "users")).toBeNull();
  });
});
