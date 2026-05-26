import { useEffect } from "react";
import type { ShortcutBinding } from "@/shared/keyboard-shortcuts";

export interface ShortcutDef extends ShortcutBinding {
  enabled?: boolean;
  handler: (e: KeyboardEvent) => void;
}

/**
 * Registers global keyboard shortcuts.
 * Shortcuts fire with exact modifier matching based on each binding's modifier family.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutDef[]) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      for (const s of shortcuts) {
        if (s.enabled === false) continue;

        const keyMatch = s.code ? e.code === s.code : e.key.toLowerCase() === s.key?.toLowerCase();
        const commandMatch =
          s.modifier === "command" ? e.metaKey || e.ctrlKey : !e.metaKey && !e.ctrlKey;
        const shiftMatch = s.shift ? e.shiftKey : !e.shiftKey;
        const altMatch = s.modifier === "alt" ? e.altKey : !e.altKey;
        if (keyMatch && commandMatch && shiftMatch && altMatch) {
          e.preventDefault();
          e.stopPropagation();
          s.handler(e);
          return;
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [shortcuts]);
}
