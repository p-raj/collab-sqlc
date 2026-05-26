import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { editor as MonacoEditorNS } from "monaco-editor";
import { SqlEditor } from "./SqlEditor";

const triggerMock = vi.fn();
const focusMock = vi.fn();
const registerCompletionItemProviderMock = vi.fn(() => ({ dispose: vi.fn() }));
const registerSignatureHelpProviderMock = vi.fn(() => ({ dispose: vi.fn() }));

const editorStub = {
  addAction: vi.fn(),
  onDidChangeCursorSelection: vi.fn(),
  focus: focusMock,
  hasTextFocus: vi.fn(() => true),
  trigger: triggerMock,
  getModel: vi.fn(() => null),
  getSelection: vi.fn(() => null),
  getPosition: vi.fn(() => null),
} satisfies Partial<MonacoEditorNS.IStandaloneCodeEditor>;

const monacoStub = {
  editor: {
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
    setModelMarkers: vi.fn(),
  },
  languages: {
    registerCompletionItemProvider: registerCompletionItemProviderMock,
    registerSignatureHelpProvider: registerSignatureHelpProviderMock,
  },
} as const;

vi.mock("@/shared/contexts/theme-context", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));

vi.mock("@/shared/keyboard-shortcuts", () => ({
  getShortcutSpec: () => ({
    description: "Shortcut",
    actionLabel: "Shortcut",
    binding: { key: "Enter", ctrl: true, meta: false, alt: false, shift: false },
  }),
  toMonacoKeybinding: () => 1,
}));

vi.mock("../sql-completion", () => ({
  createSqlCompletionProvider: vi.fn(() => ({})),
  createSqlSignatureHelpProvider: vi.fn(() => ({})),
}));

vi.mock("@monaco-editor/react", () => ({
  default: ({
    onMount,
  }: {
    onMount?: (
      editor: MonacoEditorNS.IStandaloneCodeEditor,
      monaco: typeof import("monaco-editor"),
    ) => void;
  }) => {
    useEffect(() => {
      if (!onMount) return;

      onMount(
        editorStub as unknown as MonacoEditorNS.IStandaloneCodeEditor,
        monacoStub as unknown as typeof import("monaco-editor"),
      );
    }, [onMount]);

    return <div data-testid="monaco-editor" />;
  },
}));

describe("SqlEditor", () => {
  beforeEach(() => {
    triggerMock.mockClear();
    focusMock.mockClear();
    registerCompletionItemProviderMock.mockClear();
    registerSignatureHelpProviderMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("re-triggers suggestions when schema tables arrive for the mounted editor", async () => {
    const { rerender } = render(
      <SqlEditor
        value=""
        onChange={() => {}}
        onExecute={() => {}}
        completionTables={[]}
        dbType="postgresql"
      />,
    );

    expect(triggerMock).not.toHaveBeenCalled();

    await act(async () => {
      rerender(
        <SqlEditor
          value=""
          onChange={() => {}}
          onExecute={() => {}}
          completionTables={[
            {
              schema_name: "public",
              table_name: "users",
              columns: [],
              comment: null,
              row_count: null,
            },
          ]}
          dbType="postgresql"
        />,
      );
    });

    expect(triggerMock).toHaveBeenCalledWith("schema-loaded", "editor.action.triggerSuggest", {});
  });
});
