import { useCallback, useEffect, useState } from "react";
import { History, RotateCcw, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import * as queriesApi from "../services/queries-api";
import type { SavedQueryVersion } from "../types";

interface VersionHistoryPanelProps {
  queryId: string;
  currentSql: string;
  onRestored: () => void;
}

export function VersionHistoryPanel({ queryId, currentSql, onRestored }: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<SavedQueryVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await queriesApi.fetchVersions(queryId);
      setVersions(data);
    } catch {
      toast.error("Failed to load version history");
    } finally {
      setIsLoading(false);
    }
  }, [queryId]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const handleRestore = useCallback(
    async (versionId: string) => {
      try {
        await queriesApi.restoreVersion(queryId, versionId);
        toast.success("Version restored");
        onRestored();
        loadVersions();
      } catch {
        toast.error("Failed to restore version");
      }
    },
    [queryId, onRestored, loadVersions],
  );

  if (isLoading) {
    return <div className="p-3 text-xs text-muted-foreground">Loading versions...</div>;
  }

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 p-4 text-center">
        <History size={16} className="text-muted-foreground/50" />
        <span className="text-xs text-muted-foreground">No version history yet</span>
        <span className="text-[0.75rem] text-muted-foreground/60">
          Versions are created when a query is updated
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-1">
      <div className="px-1 pb-1 text-xs font-medium text-muted-foreground">Version History</div>
      {versions.map((v) => {
        const isExpanded = expandedId === v.id;
        const diffLines = computeSimpleDiff(v.sql, currentSql);
        return (
          <div key={v.id} className="rounded border border-input/50 bg-card/50">
            <button
              onClick={() => setExpandedId(isExpanded ? null : v.id)}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent/50"
            >
              {isExpanded ? (
                <ChevronDown size={10} className="shrink-0" />
              ) : (
                <ChevronRight size={10} className="shrink-0" />
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-medium">v{v.version_number}</span>
                  <span className="truncate text-muted-foreground">{v.title}</span>
                </div>
                <span className="text-[0.75rem] text-muted-foreground/60">
                  {new Date(v.created_at).toLocaleString()}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRestore(v.id);
                }}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Restore this version"
              >
                <RotateCcw size={11} />
              </button>
            </button>
            {isExpanded && (
              <div className="border-t border-input/50 p-2">
                <div className="max-h-40 overflow-auto rounded bg-muted/30 p-2 font-mono text-[0.75rem]">
                  {diffLines.map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.type === "add"
                          ? "text-green-600"
                          : line.type === "remove"
                            ? "text-red-500"
                            : "text-muted-foreground"
                      }
                    >
                      {line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  "}
                      {line.text}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Simple line-based diff
interface DiffLine {
  type: "same" | "add" | "remove";
  text: string;
}

function computeSimpleDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: DiffLine[] = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === newLine) {
      result.push({ type: "same", text: oldLine ?? "" });
    } else {
      if (oldLine !== undefined) result.push({ type: "remove", text: oldLine });
      if (newLine !== undefined) result.push({ type: "add", text: newLine });
    }
  }

  return result;
}
