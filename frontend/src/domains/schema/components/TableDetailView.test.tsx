import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useSchemaStore } from "../hooks/use-schema-store";
import { TableDetailView } from "./TableDetailView";

const TABLE_DETAIL_KEY = "conn-1:public:users";
const TABLE_DETAIL = {
  connection_id: "conn-1",
  schema_name: "public",
  table_name: "users",
  cached: false,
  table: {
    schema_name: "public",
    table_name: "users",
    row_count: 12,
    comment: "Application users",
    columns: [
      {
        name: "id",
        data_type: "uuid",
        is_nullable: false,
        is_primary_key: true,
        default_value: null,
        comment: null,
        foreign_key: null,
      },
      {
        name: "role_id",
        data_type: "uuid",
        is_nullable: false,
        is_primary_key: false,
        default_value: null,
        comment: null,
        foreign_key: "public.roles.id",
      },
    ],
  },
  relationships: {
    incoming: [
      {
        source_schema_name: "public",
        source_table_name: "orders",
        target_schema_name: "public",
        target_table_name: "users",
        constraint_name: "orders_user_id_fkey",
        column_mappings: [{ source_column: "user_id", target_column: "id" }],
      },
    ],
    outgoing: [
      {
        source_schema_name: "public",
        source_table_name: "users",
        target_schema_name: "public",
        target_table_name: "roles",
        constraint_name: "users_role_id_fkey",
        column_mappings: [{ source_column: "role_id", target_column: "id" }],
      },
    ],
  },
  metadata: {
    indexes: [],
    constraints: [],
    enums: [],
    properties: [{ label: "Engine", value: "Heap" }],
  },
  erd: {
    focus_table_key: "public.users",
    tables: [
      {
        schema_name: "public",
        table_name: "users",
        is_focus: true,
        columns: [
          {
            name: "id",
            data_type: "uuid",
            is_primary_key: true,
            is_foreign_key: false,
          },
        ],
      },
      {
        schema_name: "public",
        table_name: "roles",
        is_focus: false,
        columns: [
          {
            name: "id",
            data_type: "uuid",
            is_primary_key: true,
            is_foreign_key: false,
          },
        ],
      },
    ],
    edges: [
      {
        id: "users_role_id_fkey",
        source_table_key: "public.users",
        target_table_key: "public.roles",
        constraint_name: "users_role_id_fkey",
        column_mappings: [{ source_column: "role_id", target_column: "id" }],
      },
    ],
  },
};

describe("TableDetailView", () => {
  beforeEach(() => {
    useSchemaStore.getState().clear();
    useSchemaStore.setState((state) => ({
      ...state,
      tableDetails: {
        [TABLE_DETAIL_KEY]: TABLE_DETAIL,
      },
    }));
  });

  afterEach(() => {
    cleanup();
    useSchemaStore.getState().clear();
  });

  it("opens all table explorer tabs and keeps preview available", () => {
    const onPreviewQuery = vi.fn();

    render(
      <TableDetailView
        connectionId="conn-1"
        schemaName="public"
        tableName="users"
        onPreviewQuery={onPreviewQuery}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(onPreviewQuery).toHaveBeenCalledWith('SELECT * FROM "public"."users" LIMIT 100');

    expect(screen.getByText("Columns")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Relationships" }));
    expect(screen.getByText("Tables that point to this table.")).toBeInTheDocument();
    expect(screen.getByText("public.roles")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Metadata" }));
    expect(screen.getByText("Database-specific table settings.")).toBeInTheDocument();
    expect(screen.getByText("Engine")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "ERD" }));
    expect(screen.getByText("Focus table")).toBeInTheDocument();
  });

  it("updates from the first fetch without showing the unavailable state", async () => {
    useSchemaStore.getState().clear();
    useSchemaStore.setState((state) => ({
      ...state,
      fetchTableDetail: vi.fn(async () => {
        useSchemaStore.setState((current) => ({
          ...current,
          tableDetailLoadingIds: new Set([TABLE_DETAIL_KEY]),
        }));
        await Promise.resolve();
        useSchemaStore.setState((current) => ({
          ...current,
          tableDetails: { ...current.tableDetails, [TABLE_DETAIL_KEY]: TABLE_DETAIL },
          tableDetailErrors: { ...current.tableDetailErrors, [TABLE_DETAIL_KEY]: "" },
          tableDetailLoadingIds: new Set<string>(),
        }));
      }),
    }));

    render(
      <TableDetailView
        connectionId="conn-1"
        schemaName="public"
        tableName="users"
        onPreviewQuery={vi.fn()}
      />,
    );

    expect(screen.queryByText("Table details unavailable")).not.toBeInTheDocument();
    expect(await screen.findByText("Columns")).toBeInTheDocument();
  });
});
