import { useEffect, useState } from "react";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useConnectionsStore } from "../hooks/use-connections-store";
import { getDatabaseEngine } from "../engine-registry";
import { Dialog } from "@/shared/components/Dialog";
import { ConnectionForm } from "./ConnectionForm";
import type { Connection } from "../types";

export function ConnectionsPanel() {
  const { connections, activeConnectionId, isLoading, load, setActive, remove } =
    useConnectionsStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Connection | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditTarget(undefined);
    setFormOpen(true);
  }

  function openEdit(conn: Connection) {
    setEditTarget(conn);
    setFormOpen(true);
  }

  async function handleSave() {
    setFormOpen(false);
    setEditTarget(undefined);
    await load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await remove(deleteTarget.id);
    toast.success(`Deleted connection "${deleteTarget.name}"`);
    setDeleteTarget(null);
    await load();
  }

  const typeBadge = (dbType: Connection["db_type"]) => (
    <span className="rounded border border-input px-1 py-px text-[0.75rem] leading-none text-muted-foreground">
      {getDatabaseEngine(dbType).shortLabel}
    </span>
  );

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-medium text-muted-foreground">Connections</span>
        <button
          type="button"
          onClick={openCreate}
          title="Add connection"
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus size={12} />
        </button>
      </div>

      {isLoading && connections.length === 0 && (
        <div className="flex items-center gap-1.5 px-2 py-3">
          <Loader2 size={12} className="animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading...</span>
        </div>
      )}

      {!isLoading && connections.length === 0 && (
        <div className="px-2 py-2 text-xs text-muted-foreground/60">No connections yet</div>
      )}

      {connections.map((conn) => (
        <div
          key={conn.id}
          className={`group flex items-center ${activeConnectionId === conn.id ? "bg-accent" : ""}`}
        >
          <button
            type="button"
            onClick={() => setActive(conn.id)}
            className="flex flex-1 items-center gap-1.5 px-2 py-1 text-left text-xs hover:bg-accent/50"
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                activeConnectionId === conn.id ? "bg-foreground" : "bg-transparent"
              }`}
            />
            <span className="flex-1 truncate">{conn.name}</span>
            {typeBadge(conn.db_type)}
          </button>
          <div className="mr-1 flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => openEdit(conn)}
              className="rounded p-0.5 text-muted-foreground/50 opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
              title={`Edit ${conn.name}`}
            >
              <Pencil size={10} />
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(conn)}
              className="rounded p-0.5 text-muted-foreground/50 opacity-0 hover:bg-accent hover:text-destructive group-hover:opacity-100"
              title={`Delete ${conn.name}`}
            >
              <Trash2 size={10} />
            </button>
          </div>
        </div>
      ))}

      {formOpen && (
        <Dialog
          title={editTarget ? "Edit Connection" : "New Connection"}
          onClose={() => setFormOpen(false)}
        >
          <ConnectionForm
            connection={editTarget}
            onSave={handleSave}
            onCancel={() => setFormOpen(false)}
          />
        </Dialog>
      )}

      {deleteTarget && (
        <Dialog title="Delete Connection" onClose={() => setDeleteTarget(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Delete <strong>{deleteTarget.name}</strong>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="h-7 rounded border border-input px-3 text-xs text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="h-7 rounded bg-foreground px-3 text-xs text-background hover:bg-foreground/90"
              >
                Delete
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
