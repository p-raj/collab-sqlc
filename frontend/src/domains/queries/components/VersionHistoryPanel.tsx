import { useCallback, useEffect, useState } from "react";
import { History, RotateCcw, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { CodeBlock } from "@/shared/components/ui/CodeBlock";
import { EmptyState, LoadingState } from "@/shared/components/ui/DataState";
import { IconButton } from "@/shared/components/ui/IconButton";
import { ObjectListItem } from "@/shared/components/ui/ObjectListItem";
import { Panel } from "@/shared/components/ui/Panel";
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
    return <LoadingState label="Loading versions" showLabel className="justify-start p-3" />;
  }

  if (versions.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No version history yet"
        description="Versions are created when a query is updated."
        className="p-4"
      />
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-1">
      <div className="px-1 pb-1 text-xs font-medium text-muted-foreground">Version History</div>
      {versions.map((v) => {
        const isExpanded = expandedId === v.id;
        const diffLines = computeSimpleDiff(v.sql, currentSql);
        return (
          <Panel key={v.id} className="rounded bg-card/50">
            <div className="flex items-center">
              <ObjectListItem
                onClick={() => setExpandedId(isExpanded ? null : v.id)}
                indicator={
                  isExpanded ? (
                    <ChevronDown size={10} className="shrink-0" />
                  ) : (
                    <ChevronRight size={10} className="shrink-0" />
                  )
                }
                className="px-2 py-1.5"
              >
                <div className="flex min-w-0 flex-col text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">v{v.version_number}</span>
                    <span className="truncate text-muted-foreground">{v.title}</span>
                  </div>
                  <span className="text-[0.75rem] text-muted-foreground/60">
                    {new Date(v.created_at).toLocaleString()}
                  </span>
                </div>
              </ObjectListItem>
              <IconButton
                aria-label="Restore this version"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRestore(v.id);
                }}
                icon={<RotateCcw size={11} />}
                size="xs"
                title="Restore this version"
              />
            </div>
            {isExpanded && (
              <div className="border-t border-input/50 p-2">
                <CodeBlock className="max-h-40 border-0 bg-muted/30 p-2 text-[0.75rem]">
                  {diffLines.map((line, i) => (
                    <span
                      key={i}
                      role="presentation"
                      className={
                        line.type === "add"
                          ? "block text-success"
                          : line.type === "remove"
                            ? "block text-destructive"
                            : "block text-muted-foreground"
                      }
                    >
                      {line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  "}
                      {line.text}
                    </span>
                  ))}
                </CodeBlock>
              </div>
            )}
          </Panel>
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
