export type ShortcutId =
    | "run-query"
    | "toggle-comment"
    | "save-query"
    | "save-query-as"
    | "format-sql"
    | "focus-editor"
    | "explain-query"
    | "new-tab"
    | "close-tab"
    | "switch-tab-1"
    | "switch-tab-2"
    | "switch-tab-3"
    | "switch-tab-4"
    | "switch-tab-5"
    | "switch-tab-6"
    | "toggle-sidebar"
    | "show-shortcuts"
    | "open-search";

export type ShortcutGroup = "editor" | "tabs" | "navigation";
export type ShortcutScope = "global" | "editor";
export type ShortcutModifier = "command" | "alt";

export interface ShortcutBinding {
    modifier: ShortcutModifier;
    key?: string;
    code?: string;
    shift?: boolean;
}

export interface ShortcutSpec {
    id: ShortcutId;
    group: ShortcutGroup;
    scope: ShortcutScope;
    description: string;
    binding: ShortcutBinding;
    actionLabel?: string;
}

const GROUP_ORDER: ShortcutGroup[] = ["editor", "tabs", "navigation"];

const GROUP_LABELS: Record<ShortcutGroup, string> = {
    editor: "Editor",
    tabs: "Tabs",
    navigation: "Navigation",
};

export const shortcutSpecs: ShortcutSpec[] = [
    {
        id: "run-query",
        group: "editor",
        scope: "editor",
        description: "Run query (or selection)",
        binding: { modifier: "command", key: "Enter" },
        actionLabel: "Execute Query",
    },
    {
        id: "toggle-comment",
        group: "editor",
        scope: "editor",
        description: "Comment or uncomment",
        binding: { modifier: "command", code: "Slash" },
        actionLabel: "Toggle Comment",
    },
    {
        id: "save-query",
        group: "editor",
        scope: "editor",
        description: "Save query",
        binding: { modifier: "command", code: "KeyS" },
        actionLabel: "Save Query",
    },
    {
        id: "save-query-as",
        group: "editor",
        scope: "editor",
        description: "Save query as",
        binding: { modifier: "command", code: "KeyS", shift: true },
        actionLabel: "Save Query As",
    },
    {
        id: "format-sql",
        group: "editor",
        scope: "editor",
        description: "Format SQL",
        binding: { modifier: "command", code: "KeyF", shift: true },
        actionLabel: "Format SQL",
    },
    {
        id: "focus-editor",
        group: "editor",
        scope: "global",
        description: "Focus editor",
        binding: { modifier: "alt", code: "KeyE", shift: true },
    },
    {
        id: "explain-query",
        group: "editor",
        scope: "editor",
        description: "Explain analyze query",
        binding: { modifier: "command", key: "Enter", shift: true },
        actionLabel: "Explain Analyze Query",
    },
    {
        id: "new-tab",
        group: "tabs",
        scope: "global",
        description: "New tab",
        binding: { modifier: "alt", code: "KeyN" },
    },
    {
        id: "close-tab",
        group: "tabs",
        scope: "global",
        description: "Close tab",
        binding: { modifier: "alt", code: "KeyW" },
    },
    {
        id: "switch-tab-1",
        group: "tabs",
        scope: "global",
        description: "Switch to tab 1",
        binding: { modifier: "alt", code: "Digit1" },
    },
    {
        id: "switch-tab-2",
        group: "tabs",
        scope: "global",
        description: "Switch to tab 2",
        binding: { modifier: "alt", code: "Digit2" },
    },
    {
        id: "switch-tab-3",
        group: "tabs",
        scope: "global",
        description: "Switch to tab 3",
        binding: { modifier: "alt", code: "Digit3" },
    },
    {
        id: "switch-tab-4",
        group: "tabs",
        scope: "global",
        description: "Switch to tab 4",
        binding: { modifier: "alt", code: "Digit4" },
    },
    {
        id: "switch-tab-5",
        group: "tabs",
        scope: "global",
        description: "Switch to tab 5",
        binding: { modifier: "alt", code: "Digit5" },
    },
    {
        id: "switch-tab-6",
        group: "tabs",
        scope: "global",
        description: "Switch to tab 6",
        binding: { modifier: "alt", code: "Digit6" },
    },
    {
        id: "toggle-sidebar",
        group: "navigation",
        scope: "global",
        description: "Toggle sidebar",
        binding: { modifier: "alt", key: "b" },
    },
    {
        id: "show-shortcuts",
        group: "navigation",
        scope: "global",
        description: "Show shortcuts",
        binding: { modifier: "alt", code: "Slash", shift: true },
    },
    {
        id: "open-search",
        group: "navigation",
        scope: "global",
        description: "Search",
        binding: { modifier: "alt", key: "k" },
    },
];

function getBindingKeyLabel(binding: ShortcutBinding): string {
    if (binding.key) {
        return binding.key.length === 1 ? binding.key.toUpperCase() : binding.key;
    }

    if (!binding.code) return "";
    if (binding.code.startsWith("Key")) return binding.code.slice(3);
    if (binding.code.startsWith("Digit")) return binding.code.slice(5);
    if (binding.code === "Slash") return "/";
    return binding.code;
}

export function formatShortcutBinding(binding: ShortcutBinding, isMac: boolean): string {
    const parts = [binding.modifier === "command" ? (isMac ? "⌘" : "Ctrl") : (isMac ? "⌥" : "Alt")];

    if (binding.shift) {
        parts.push("Shift");
    }

    const keyLabel = getBindingKeyLabel(binding);
    if (keyLabel) {
        parts.push(keyLabel);
    }

    return parts.join(" + ");
}

function getMonacoKeyCodeName(binding: ShortcutBinding): string | null {
    if (binding.code) {
        return binding.code;
    }

    if (!binding.key) return null;
    if (binding.key === "Enter") return "Enter";
    if (binding.key === "/") return "Slash";
    if (/^[a-z]$/i.test(binding.key)) return `Key${binding.key.toUpperCase()}`;
    if (/^[0-9]$/.test(binding.key)) return `Digit${binding.key}`;
    return null;
}

type MonacoKeybindingApi = Pick<typeof import("monaco-editor"), "KeyCode" | "KeyMod">;

export function toMonacoKeybinding(
    monaco: MonacoKeybindingApi,
    binding: ShortcutBinding,
): number {
    const keyCodeName = getMonacoKeyCodeName(binding);
    if (!keyCodeName) {
        throw new Error("Shortcut binding cannot be converted to a Monaco keybinding");
    }

    const keyCode = (monaco.KeyCode as Record<string, number | string>)[keyCodeName];
    if (typeof keyCode !== "number") {
        throw new Error(`Unsupported Monaco key code: ${keyCodeName}`);
    }

    let keybinding = monaco.KeyMod.CtrlCmd | keyCode;
    if (binding.modifier === "alt") {
        keybinding = monaco.KeyMod.Alt | keyCode;
    }
    if (binding.shift) {
        keybinding |= monaco.KeyMod.Shift;
    }

    return keybinding;
}

export function getShortcutSpec(id: ShortcutId): ShortcutSpec {
    const spec = shortcutSpecs.find((item) => item.id === id);
    if (!spec) {
        throw new Error(`Unknown shortcut: ${id}`);
    }
    return spec;
}

export function getShortcutGroups() {
    return GROUP_ORDER.map((group) => ({
        id: group,
        label: GROUP_LABELS[group],
        items: shortcutSpecs.filter((item) => item.group === group),
    }));
}