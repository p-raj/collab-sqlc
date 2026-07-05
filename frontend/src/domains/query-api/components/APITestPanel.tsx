import { useCallback, useEffect, useMemo, useState } from "react";
import { HTTPError } from "ky";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/Button";
import { Callout } from "@/shared/components/ui/Callout";
import { ErrorState } from "@/shared/components/ui/DataState";
import { Field, FieldLabel } from "@/shared/components/ui/Field";
import { Input } from "@/shared/components/ui/Input";
import { Select } from "@/shared/components/ui/Select";
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
            <Field key={p.name}>
              <FieldLabel>
                {p.name}
                <span className="ml-1 text-[10px]">({p.type})</span>
                {p.required && <span className="text-destructive ml-0.5">*</span>}
              </FieldLabel>
              {p.type === "boolean" ? (
                <Select
                  value={getDisplayedValue(p)}
                  onChange={(e) => handleParamChange(p.name, e.target.value)}
                  size="sm"
                  className="font-mono"
                >
                  <option value="">Select...</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </Select>
              ) : (
                <Input
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
                  size="sm"
                  className="font-mono"
                />
              )}
            </Field>
          ))}
        </div>
      )}

      {missingRequiredParameters.length > 0 && (
        <Callout tone="warning" icon={null}>
          Fill required parameters before running: {missingRequiredParameters.join(", ")}
        </Callout>
      )}

      {/* Run button */}
      <Button
        onClick={handleRun}
        variant="primary"
        loading={loading}
        disabled={!connectionId || missingRequiredParameters.length > 0}
        leftIcon={<Play className="h-3 w-3" />}
        className="w-full"
      >
        Run Test
      </Button>

      {/* Error */}
      {error && <ErrorState message={error} className="p-0 text-xs" />}

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
