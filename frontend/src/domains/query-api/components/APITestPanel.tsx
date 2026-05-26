import { useCallback, useEffect, useMemo, useState } from "react";
import { HTTPError } from "ky";
import { Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as queryApiService from "../services/query-api";
import type { ParameterDef } from "../types";

interface Props {
  queryId: string;
  parameters: ParameterDef[] | null;
  connectionId: string | null;
  paramValues: Record<string, string>;
  onParamValueChange: (name: string, value: string) => void;
}

export function APITestPanel({
  queryId,
  parameters,
  connectionId,
  paramValues,
  onParamValueChange,
}: Props) {
  const [result, setResult] = useState<{
    columns: string[];
    rows: unknown[][];
    row_count: number;
    execution_time_ms: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setResult(null);
    setError(null);
  }, [parameters, queryId]);

  const getDisplayedValue = useCallback(
    (parameter: ParameterDef): string => {
      const value = paramValues[parameter.name];
      if (value != null) {
        return value;
      }
      if (parameter.default == null) {
        return "";
      }
      return String(parameter.default);
    },
    [paramValues],
  );

  const missingRequiredParameters = useMemo(
    () =>
      (parameters ?? [])
        .filter((parameter) => parameter.required)
        .filter((parameter) => getDisplayedValue(parameter).trim() === "")
        .map((parameter) => parameter.name),
    [getDisplayedValue, parameters],
  );

  const handleRun = useCallback(async () => {
    if (!connectionId) {
      toast.error("Select a connection first");
      return;
    }
    if (missingRequiredParameters.length > 0) {
      const message = `Provide required parameters: ${missingRequiredParameters.join(", ")}`;
      setError(message);
      toast.error(message);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params: Record<string, unknown> = {};
      for (const parameter of parameters ?? []) {
        const value = getDisplayedValue(parameter).trim();
        if (value === "") {
          continue;
        }

        if (parameter.type === "integer") {
          params[parameter.name] = parseInt(value, 10);
        } else if (parameter.type === "float" || parameter.type === "number") {
          params[parameter.name] = Number(value);
        } else if (parameter.type === "boolean") {
          params[parameter.name] = value === "true";
        } else {
          params[parameter.name] = value;
        }
      }

      const data = await queryApiService.testExecuteAPI(queryId, {
        connection_id: connectionId,
        params,
      });
      setResult(data);
    } catch (e) {
      let message = "Execution failed";
      if (e instanceof HTTPError) {
        try {
          const body = (await e.response.json()) as { message?: string };
          message = body.message ?? message;
        } catch {
          message = e.message;
        }
      } else if (e instanceof Error) {
        message = e.message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [connectionId, getDisplayedValue, missingRequiredParameters, parameters, queryId]);

  const inputTypeFor = useCallback((parameter: ParameterDef): string => {
    if (parameter.type === "integer" || parameter.type === "float" || parameter.type === "number") {
      return "number";
    }
    return "text";
  }, []);

  const handleParamChange = useCallback(
    (name: string, value: string) => {
      setError(null);
      onParamValueChange(name, value);
    },
    [onParamValueChange],
  );

  return (
    <div className="p-3 space-y-3 text-sm">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Test Execution
      </h4>

      {!connectionId && (
        <p className="text-xs text-muted-foreground">
          Select a connection in the editor to test against.
        </p>
      )}

      {/* Parameter inputs */}
      {parameters && parameters.length > 0 && (
        <div className="space-y-2">
          {parameters.map((p) => (
            <label key={p.name} className="block space-y-0.5">
              <span className="text-xs text-muted-foreground">
                {p.name}
                <span className="ml-1 text-[10px]">({p.type})</span>
                {p.required && <span className="text-destructive ml-0.5">*</span>}
              </span>
              {p.type === "boolean" ? (
                <select
                  value={getDisplayedValue(p)}
                  onChange={(e) => handleParamChange(p.name, e.target.value)}
                  className="w-full rounded border bg-background px-2 py-1 text-xs font-mono"
                >
                  <option value="">Select...</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  type={inputTypeFor(p)}
                  value={getDisplayedValue(p)}
                  onChange={(e) => handleParamChange(p.name, e.target.value)}
                  placeholder={p.default != null ? String(p.default) : `Enter ${p.name}`}
                  step={
                    p.type === "integer"
                      ? "1"
                      : p.type === "float" || p.type === "number"
                        ? "any"
                        : undefined
                  }
                  className="w-full rounded border bg-background px-2 py-1 text-xs font-mono"
                />
              )}
            </label>
          ))}
        </div>
      )}

      {missingRequiredParameters.length > 0 && (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Fill required parameters before running: {missingRequiredParameters.join(", ")}
        </div>
      )}

      {/* Run button */}
      <button
        onClick={handleRun}
        disabled={loading || !connectionId || missingRequiredParameters.length > 0}
        className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
        Run Test
      </button>

      {/* Error */}
      {error && (
        <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{result.row_count} rows</span>
            <span>{result.execution_time_ms}ms</span>
          </div>
          <div className="max-h-48 overflow-auto rounded border text-xs">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {result.columns.map((col) => (
                    <th key={col} className="px-2 py-1 text-left font-medium whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 20).map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-1 whitespace-nowrap font-mono">
                        {cell == null ? (
                          <span className="text-muted-foreground italic">null</span>
                        ) : (
                          String(cell)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {result.rows.length > 20 && (
                  <tr>
                    <td
                      colSpan={result.columns.length}
                      className="px-2 py-1 text-center text-muted-foreground"
                    >
                      … {result.rows.length - 20} more rows
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
