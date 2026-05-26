import { Dialog } from "./Dialog";
import { formatShortcutBinding, getShortcutGroups } from "@/shared/keyboard-shortcuts";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border bg-muted px-1.5 font-mono text-[0.75rem] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

function ShortcutKeys({ keys }: { keys: string }) {
  const parts = keys.split(" + ");
  return (
    <span className="flex items-center gap-0.5">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-0.5">
          {i > 0 && <span className="text-muted-foreground/50 text-[0.75rem]">+</span>}
          <Kbd>{part}</Kbd>
        </span>
      ))}
    </span>
  );
}

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

export function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  const groups = getShortcutGroups();

  return (
    <Dialog title="Keyboard Shortcuts" onClose={onClose}>
      <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
        {groups.map((group) => (
          <div key={group.label}>
            <h3 className="mb-1.5 text-[0.75rem] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h3>
            <div className="flex flex-col gap-1">
              {group.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded px-2 py-1 hover:bg-accent"
                >
                  <span className="text-xs text-foreground">{item.description}</span>
                  <ShortcutKeys keys={formatShortcutBinding(item.binding, isMac)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
