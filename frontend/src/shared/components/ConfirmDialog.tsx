import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  title: string;
  message: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  const isDanger = variant === "danger";

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-[400px] rounded-lg border bg-card shadow-lg">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          {isDanger && <AlertTriangle size={16} className="text-destructive shrink-0" />}
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <div className="px-4 py-3 text-sm text-muted-foreground">{message}</div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded px-3 py-1.5 text-xs font-medium text-white ${
              isDanger
                ? "bg-destructive hover:bg-destructive/90"
                : "bg-primary hover:bg-primary/90"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
