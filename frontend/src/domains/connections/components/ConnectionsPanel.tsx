import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useConnectionsStore } from "../hooks/use-connections-store";
import { getDatabaseEngine } from "../engine-registry";
import { Dialog } from "@/shared/components/Dialog";
import { Badge } from "@/shared/components/ui/Badge";
import { Button } from "@/shared/components/ui/Button";
import { EmptyState, LoadingState } from "@/shared/components/ui/DataState";
import { IconButton } from "@/shared/components/ui/IconButton";
import { ObjectListItem } from "@/shared/components/ui/ObjectListItem";
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
    <Badge variant="neutral">{getDatabaseEngine(dbType).shortLabel}</Badge>
  );

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-medium text-muted-foreground">Connections</span>
        <IconButton
          type="button"
          onClick={openCreate}
          title="Add connection"
          aria-label="Add connection"
          icon={<Plus size={12} />}
        />
      </div>

      {isLoading && connections.length === 0 && (
        <LoadingState label="Loading connections" showLabel className="px-2 py-3" />
      )}

      {!isLoading && connections.length === 0 && (
        <EmptyState title="No connections yet" className="px-2 py-3" />
      )}

      {connections.map((conn) => (
        <div
          key={conn.id}
          className={`group flex items-center ${activeConnectionId === conn.id ? "bg-accent" : ""}`}
        >
          <ObjectListItem
            onClick={() => setActive(conn.id)}
            active={activeConnectionId === conn.id}
            indicator={
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  activeConnectionId === conn.id ? "bg-foreground" : "bg-transparent"
                }`}
              />
            }
            meta={typeBadge(conn.db_type)}
          >
            {conn.name}
          </ObjectListItem>
          <div className="mr-1 flex shrink-0 items-center">
            <IconButton
              type="button"
              onClick={() => openEdit(conn)}
              className="opacity-0 group-hover:opacity-100"
              title={`Edit ${conn.name}`}
              aria-label={`Edit ${conn.name}`}
              icon={<Pencil size={10} />}
            />
            <IconButton
              type="button"
              onClick={() => setDeleteTarget(conn)}
              className="opacity-0 group-hover:opacity-100"
              variant="danger"
              title={`Delete ${conn.name}`}
              aria-label={`Delete ${conn.name}`}
              icon={<Trash2 size={10} />}
            />
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
              <Button
                type="button"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={confirmDelete}
                variant="danger"
              >
                Delete
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
