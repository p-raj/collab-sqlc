import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText, FolderOpen, Globe, Loader2 } from "lucide-react";
import { useSavedQueriesStore } from "@/domains/queries/hooks/use-saved-queries-store";
import type { QueryFolder, SavedQuery } from "@/domains/queries/types";

interface Props {
  onOpenQuery: (query: SavedQuery) => void;
}

export function APIQueriesPanel({ onOpenQuery }: Props) {
  const { folders, queries, isLoading, loadAll } = useSavedQueriesStore();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const hostedQueries = useMemo(() => queries.filter((query) => query.api_enabled), [queries]);
  const hostedFolderIds = useMemo(
    () => new Set(hostedQueries.map((query) => query.folder_id).filter(Boolean)),
    [hostedQueries],
  );
  const visibleFolders = useMemo(
    () => folders.filter((folder) => hostedFolderIds.has(folder.id)),
    [folders, hostedFolderIds],
  );
  const rootQueries = useMemo(
    () => hostedQueries.filter((query) => !query.folder_id),
    [hostedQueries],
  );

  const queriesByFolder = useCallback(
    (folderId: string) => hostedQueries.filter((query) => query.folder_id === folderId),
    [hostedQueries],
  );

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setExpandedFolders(new Set(visibleFolders.map((folder) => folder.id)));
  }, [visibleFolders]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-medium text-muted-foreground">Hosted Queries</span>
      </div>

      {isLoading && folders.length === 0 && queries.length === 0 && (
        <div className="flex items-center gap-1.5 px-2 py-3">
          <Loader2 size={12} className="animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading...</span>
        </div>
      )}

      {visibleFolders.map((folder) => (
        <HostedFolderRow
          key={folder.id}
          folder={folder}
          queries={queriesByFolder(folder.id)}
          isExpanded={expandedFolders.has(folder.id)}
          onToggle={() => toggleFolder(folder.id)}
          onOpenQuery={onOpenQuery}
        />
      ))}

      {rootQueries.map((query) => (
        <HostedQueryRow key={query.id} query={query} onOpen={() => onOpenQuery(query)} />
      ))}

      {hostedQueries.length === 0 && !isLoading && (
        <div className="px-2 py-2 text-xs text-muted-foreground/60">No hosted queries yet</div>
      )}
    </div>
  );
}

function HostedFolderRow({
  folder,
  queries,
  isExpanded,
  onToggle,
  onOpenQuery,
}: {
  folder: QueryFolder;
  queries: SavedQuery[];
  isExpanded: boolean;
  onToggle: () => void;
  onOpenQuery: (query: SavedQuery) => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full items-center gap-1.5 px-2 py-1 text-xs hover:bg-accent/50"
      >
        <ChevronRight
          size={10}
          className={`shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
        />
        <FolderOpen size={11} className="shrink-0 text-muted-foreground/70" />
        <span className="truncate">{folder.name}</span>
        {folder.is_shared && <Globe size={9} className="shrink-0 text-muted-foreground/50" />}
        <span className="ml-auto shrink-0 text-[0.75rem] text-muted-foreground/50">
          {queries.length}
        </span>
      </button>

      {isExpanded &&
        queries.map((query) => (
          <HostedQueryRow key={query.id} query={query} indent onOpen={() => onOpenQuery(query)} />
        ))}

      {isExpanded && queries.length === 0 && (
        <div className="py-1 pl-8 text-[0.75rem] text-muted-foreground/40">Empty</div>
      )}
    </div>
  );
}

function HostedQueryRow({
  query,
  indent = false,
  onOpen,
}: {
  query: SavedQuery;
  indent?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs hover:bg-accent/50 ${
        indent ? "pl-6" : "pl-2"
      }`}
      title={query.description ?? query.title}
    >
      <FileText size={11} className="shrink-0 text-muted-foreground/50" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1">
          <span className="truncate">{query.title}</span>
          {query.is_shared && (
            <span title="Shared">
              <Globe size={9} className="shrink-0 text-blue-500" />
            </span>
          )}
        </div>
        {query.description && (
          <span className="truncate text-[0.75rem] text-muted-foreground/60">
            {query.description}
          </span>
        )}
      </div>
    </button>
  );
}
