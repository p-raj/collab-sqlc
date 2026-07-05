import { Settings } from "lucide-react";
import { Button } from "@/shared/components/ui/Button";
import { Input } from "@/shared/components/ui/Input";
import { Select } from "@/shared/components/ui/Select";
import { useEditorContext, extractSmartVariables } from "../hooks/editor-context";
import type { VariableType } from "../utils/smart-variables";

const TYPE_LABELS: Record<VariableType, string> = {
  text: "abc",
  number: "123",
  boolean: "T/F",
  date: "date",
  datetime: "dt",
  list: "list",
};

const TYPE_PLACEHOLDER: Record<VariableType, string> = {
  text: "value",
  number: "0",
  boolean: "true / false",
  date: "YYYY-MM-DD",
  datetime: "YYYY-MM-DD HH:mm:ss",
  list: "a, b, c",
};

function inputTypeFor(type: VariableType): string {
  switch (type) {
    case "date": return "date";
    case "datetime": return "datetime-local";
    case "number": return "number";
    default: return "text";
  }
}

function formatDatetimeValue(value: string, type: VariableType): string {
  // datetime-local inputs need "T" separator, but we store space-separated
  if (type === "datetime" && value.includes(" ") && !value.includes("T")) {
    return value.replace(" ", "T");
  }
  return value;
}

function normalizeDatetimeInput(value: string, type: VariableType): string {
  // datetime-local inputs output "T" separator — convert to space for SQL
  if (type === "datetime" && value.includes("T")) {
    return value.replace("T", " ");
  }
  return value;
}

interface VariableBarProps {
  isConfigOpen: boolean;
  canManageApi: boolean;
  onOpenConfig: () => void;
}

export function VariableBar({ isConfigOpen, canManageApi, onOpenConfig }: VariableBarProps) {
  const { activeTab, dispatch } = useEditorContext();

  if (!activeTab) return null;

  const vars = extractSmartVariables(activeTab.sql);
  const canConfigure = canManageApi && Boolean(activeTab.savedQueryId);
  if (vars.length === 0 && !canConfigure) return null;

  return (
    <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        <span
          className="shrink-0 text-[0.75rem] text-muted-foreground"
          title="Use {name:type} or $name in your SQL to create parameters"
        >
          Parameters:
        </span>
        {vars.length === 0 ? (
          <span className="shrink-0 text-[0.75rem] text-muted-foreground">
            No SQL parameters detected
          </span>
        ) : (
          vars.map((v) => (
            <span
              key={v.name}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-input bg-accent/30 px-2 py-0.5"
            >
              <span className="text-[0.75rem] font-mono text-muted-foreground">{v.name}</span>
              <span className="text-[0.65rem] text-muted-foreground/60">{TYPE_LABELS[v.type]}</span>

              {v.type === "boolean" ? (
                <Select
                  value={activeTab.variables[v.name] ?? ""}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_VARIABLE",
                      tabId: activeTab.id,
                      name: v.name,
                      value: e.target.value,
                    })
                  }
                  size="xs"
                  className="h-5 border-0 bg-transparent px-0 text-foreground"
                >
                  <option value="">—</option>
                  <option value="true">TRUE</option>
                  <option value="false">FALSE</option>
                </Select>
              ) : (
                <Input
                  type={inputTypeFor(v.type)}
                  value={formatDatetimeValue(activeTab.variables[v.name] ?? "", v.type)}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_VARIABLE",
                      tabId: activeTab.id,
                      name: v.name,
                      value: normalizeDatetimeInput(e.target.value, v.type),
                    })
                  }
                  placeholder={TYPE_PLACEHOLDER[v.type]}
                  step={v.type === "number" ? "any" : undefined}
                  size="xs"
                  className={`h-5 border-0 bg-transparent px-0 text-foreground ${
                    v.type === "list" ? "w-40" : v.type === "datetime" ? "w-44" : "w-24"
                  }`}
                />
              )}
            </span>
          ))
        )}
      </div>

      {canManageApi && (
        <Button
          type="button"
          onClick={onOpenConfig}
          disabled={!canConfigure}
          variant="secondary"
          size="xs"
          className={
            isConfigOpen
              ? "border-primary/30 bg-primary/10 text-foreground hover:bg-primary/10"
              : ""
          }
          title={
            canConfigure
              ? "Open query configuration"
              : "Save this query first to configure API hosting"
          }
          aria-label="Open query configuration"
        >
          <Settings size={12} />
          Configure
        </Button>
      )}
    </div>
  );
}
