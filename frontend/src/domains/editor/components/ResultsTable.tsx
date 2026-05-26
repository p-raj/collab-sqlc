import { useMemo, useCallback, useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { useTheme } from "@/shared/contexts/theme-context";
import type { QueryResult } from "../types";

// ag-grid types — imported as type-only (no bundle cost)
import type {
  ColDef,
  ValueFormatterParams,
  CellDoubleClickedEvent,
  CellClassParams,
} from "ag-grid-community";
import type { AgGridReact as AgGridReactType } from "ag-grid-react";

interface ResultsTableProps {
  result: QueryResult;
}

/**
 * Lazy-load ag-grid modules. The 893 KB bundle is fetched only when
 * ResultsTable first mounts, keeping the initial page load fast.
 */
function useAgGrid() {
  const AgGridRef = useRef<typeof AgGridReactType | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      import("ag-grid-community"),
      import("ag-grid-react"),
    ]).then(([community, react]) => {
      if (cancelled) return;
      community.ModuleRegistry.registerModules([community.ClientSideRowModelModule]);
      AgGridRef.current = react.AgGridReact;
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  return { AgGrid: AgGridRef.current, ready };
}

const NUMERIC_TYPE_RE = /int|float|decimal|numeric|double|real|bigint|smallint|serial/i;

function isNumericType(columnType: string): boolean {
  return NUMERIC_TYPE_RE.test(columnType);
}

function cellValueFormatter(params: ValueFormatterParams): string {
  const val = params.value as unknown;
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function nullCellClass(params: CellClassParams): string {
  return params.value === null || params.value === undefined
    ? "text-muted-foreground italic bg-muted/30"
    : "";
}

export function ResultsTable({ result }: ResultsTableProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { AgGrid, ready } = useAgGrid();

  const columnDefs = useMemo<ColDef[]>(() => {
    const rowNumCol: ColDef = {
      headerName: "#",
      valueGetter: (params) => (params.node?.rowIndex != null ? params.node.rowIndex + 1 : ""),
      width: 60,
      minWidth: 60,
      maxWidth: 60,
      sortable: false,
      filter: false,
      resizable: false,
      suppressMovable: true,
      cellClass: "text-muted-foreground text-right tabular-nums",
      pinned: "left",
    };

    const dataCols: ColDef[] = result.columns.map((col, i) => {
      const colType = result.column_types[i] ?? "";
      const numeric = isNumericType(colType);
      return {
        headerName: col,
        headerTooltip: colType ? `${col} (${colType})` : col,
        field: String(i),
        sortable: true,
        filter: true,
        resizable: true,
        minWidth: 100,
        valueFormatter: cellValueFormatter,
        cellClass: (params: CellClassParams) => {
          const base = nullCellClass(params);
          return numeric ? `${base} text-right tabular-nums`.trim() : base;
        },
        type: numeric ? "rightAligned" : undefined,
      };
    });

    return [rowNumCol, ...dataCols];
  }, [result.columns, result.column_types]);

  const rowData = useMemo(
    () =>
      result.rows.map((row) => {
        const obj: Record<string, unknown> = {};
        row.forEach((val, i) => {
          obj[String(i)] = val;
        });
        return obj;
      }),
    [result.rows],
  );

  const handleCellDoubleClick = useCallback((event: CellDoubleClickedEvent) => {
    const val = event.value as unknown;
    const text =
      val === null || val === undefined
        ? ""
        : typeof val === "object"
          ? JSON.stringify(val)
          : String(val);
    void navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }, []);

  if (!ready || !AgGrid) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading grid…
      </div>
    );
  }

  return (
    <div className={`${isDark ? "ag-theme-alpine-dark" : "ag-theme-alpine"} h-full w-full`}>
      <AgGrid
        columnDefs={columnDefs}
        rowData={rowData}
        defaultColDef={{
          sortable: true,
          filter: true,
          resizable: true,
        }}
        animateRows={false}
        rowHeight={28}
        headerHeight={32}
        suppressCellFocus
        enableCellTextSelection
        ensureDomOrder
        onCellDoubleClicked={handleCellDoubleClick}
      />
    </div>
  );
}
