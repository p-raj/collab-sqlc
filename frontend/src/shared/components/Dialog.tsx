import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface DialogProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export function Dialog({ title, children, onClose }: DialogProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex w-[80vw] max-h-[80vh] flex-col rounded-lg border bg-card shadow-lg">
        <div className="flex h-9 shrink-0 items-center justify-between border-b px-3">
          <span className="text-xs font-semibold tracking-tight">{title}</span>
          <button
            onClick={onClose}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
