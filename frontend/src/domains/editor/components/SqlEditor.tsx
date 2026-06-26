import { useCallback, useEffect, useRef } from "react";
import type { TableInfo } from "@/domains/schema/types";
import { useTheme } from "@/shared/contexts/theme-context";
import { extractActiveSql } from "@/domains/editor/utils/active-sql";
import { getShortcutSpec, toMonacoKeybinding } from "@/shared/keyboard-shortcuts";
import MonacoEditor, { type OnMount } from "@monaco-editor/react";
import type { editor, IDisposable } from "monaco-editor";
import { createSqlCompletionProvider, createSqlSignatureHelpProvider } from "../sql-completion";
import type { DatabaseType } from "../sql-completion/catalog/dialect";
import { darkTheme, lightTheme } from "../monaco/themes";

const RUN_QUERY_SHORTCUT = getShortcutSpec("run-query");
const FORMAT_SQL_SHORTCUT = getShortcutSpec("format-sql");
const EXPLAIN_QUERY_SHORTCUT = getShortcutSpec("explain-query");
const SAVE_QUERY_SHORTCUT = getShortcutSpec("save-query");
const SAVE_QUERY_AS_SHORTCUT = getShortcutSpec("save-query-as");

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: (sqlOverride?: string) => void;
  onExplain?: (sqlOverride?: string) => void;
  onFormat?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  completionTables: TableInfo[];
  dbType?: DatabaseType | null;
  onEditorReady?: (instance: editor.IStandaloneCodeEditor) => void;
  onSelectionChange?: (hasSelection: boolean) => void;
  /** 1-based character offset of a DB error in the SQL — shows an inline marker. */
  errorPosition?: number | null;
  /** Error message to display in the marker tooltip. */
  errorMessage?: string | null;
  /** Stable Monaco model path. Different paths keep undo history isolated. */
  modelPath: string;
}

/**
 * Convert a 1-based character offset into a Monaco line/column pair.
 * Returns 1-based line and column suitable for Monaco ranges.
 */
function offsetToLineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let col = 1;
  // offset is 1-based from PostgreSQL
  const target = Math.min(offset - 1, text.length);
  for (let i = 0; i < target; i++) {
    if (text[i] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, column: col };
}

function getRunnableSqlFromEditor(ed: editor.ICodeEditor): string | undefined {
  const model = ed.getModel();
  const selection = ed.getSelection();
  const position = ed.getPosition();
  if (!model || !position) return undefined;

  return extractActiveSql(
    model.getValue(),
    model.getOffsetAt(position),
    selection && !selection.isEmpty()
      ? {
          startOffset: model.getOffsetAt(selection.getStartPosition()),
          endOffset: model.getOffsetAt(selection.getEndPosition()),
        }
      : null,
  );
}

export function SqlEditor({
  value,
  onChange,
  onExecute,
  onExplain,
  onFormat,
  onSave,
  onSaveAs,
  completionTables,
  dbType,
  onEditorReady,
  onSelectionChange,
  errorPosition,
  errorMessage,
  modelPath,
}: SqlEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const onExecuteRef = useRef(onExecute);
  const onExplainRef = useRef(onExplain);
  const onFormatRef = useRef(onFormat);
  const onSaveRef = useRef(onSave);
  const onSaveAsRef = useRef(onSaveAs);
  const completionTablesRef = useRef(completionTables);
  const previousCompletionCountRef = useRef(completionTables.length);
  const dbTypeRef = useRef(dbType);
  const completionRef = useRef<IDisposable | null>(null);
  const signatureHelpRef = useRef<IDisposable | null>(null);
  const { resolvedTheme } = useTheme();

  // Keep refs in sync
  useEffect(() => {
    onExecuteRef.current = onExecute;
  }, [onExecute]);

  useEffect(() => {
    onExplainRef.current = onExplain;
  }, [onExplain]);

  useEffect(() => {
    onFormatRef.current = onFormat;
  }, [onFormat]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    onSaveAsRef.current = onSaveAs;
  }, [onSaveAs]);

  useEffect(() => {
    completionTablesRef.current = completionTables;

    if (
      previousCompletionCountRef.current === 0 &&
      completionTables.length > 0 &&
      editorRef.current?.hasTextFocus()
    ) {
      editorRef.current.trigger("schema-loaded", "editor.action.triggerSuggest", {});
    }

    previousCompletionCountRef.current = completionTables.length;
  }, [completionTables]);

  useEffect(() => {
    dbTypeRef.current = dbType;
  }, [dbType]);

  const handleMount: OnMount = useCallback(
    (editorInstance, monaco) => {
      editorRef.current = editorInstance;
      monacoRef.current = monaco;
      onEditorReady?.(editorInstance);

      monaco.editor.defineTheme("codb-dark", darkTheme);
      monaco.editor.defineTheme("codb-light", lightTheme);
      monaco.editor.setTheme(resolvedTheme === "dark" ? "codb-dark" : "codb-light");

      editorInstance.addAction({
        id: "execute-query",
        label: RUN_QUERY_SHORTCUT.actionLabel ?? RUN_QUERY_SHORTCUT.description,
        keybindings: [toMonacoKeybinding(monaco, RUN_QUERY_SHORTCUT.binding)],
        run: (ed) => {
          onExecuteRef.current(getRunnableSqlFromEditor(ed));
        },
      });

      editorInstance.addAction({
        id: "format-sql",
        label: FORMAT_SQL_SHORTCUT.actionLabel ?? FORMAT_SQL_SHORTCUT.description,
        keybindings: [toMonacoKeybinding(monaco, FORMAT_SQL_SHORTCUT.binding)],
        run: () => {
          onFormatRef.current?.();
        },
      });

      editorInstance.addAction({
        id: "explain-query",
        label: EXPLAIN_QUERY_SHORTCUT.actionLabel ?? EXPLAIN_QUERY_SHORTCUT.description,
        keybindings: [toMonacoKeybinding(monaco, EXPLAIN_QUERY_SHORTCUT.binding)],
        run: (ed) => {
          onExplainRef.current?.(getRunnableSqlFromEditor(ed));
        },
      });

      editorInstance.addAction({
        id: "save-query",
        label: SAVE_QUERY_SHORTCUT.actionLabel ?? SAVE_QUERY_SHORTCUT.description,
        keybindings: [toMonacoKeybinding(monaco, SAVE_QUERY_SHORTCUT.binding)],
        run: () => {
          onSaveRef.current?.();
        },
      });

      editorInstance.addAction({
        id: "save-query-as",
        label: SAVE_QUERY_AS_SHORTCUT.actionLabel ?? SAVE_QUERY_AS_SHORTCUT.description,
        keybindings: [toMonacoKeybinding(monaco, SAVE_QUERY_AS_SHORTCUT.binding)],
        run: () => {
          onSaveAsRef.current?.();
        },
      });

      // Track selection changes
      editorInstance.onDidChangeCursorSelection(() => {
        const selection = editorInstance.getSelection();
        onSelectionChange?.(!!selection && !selection.isEmpty());
      });

      // Register schema-aware completion
      const getDbType = () => dbTypeRef.current ?? null;
      completionRef.current = monaco.languages.registerCompletionItemProvider(
        "sql",
        createSqlCompletionProvider(() => completionTablesRef.current, getDbType),
      );

      // Register function signature help
      signatureHelpRef.current = monaco.languages.registerSignatureHelpProvider(
        "sql",
        createSqlSignatureHelpProvider(() => completionTablesRef.current, getDbType),
      );

      editorInstance.focus();
    },
    [resolvedTheme, onEditorReady, onSelectionChange],
  );

  // Set/clear error markers based on errorPosition
  useEffect(() => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    const model = ed?.getModel();
    if (!monaco || !model) return;

    if (errorPosition && errorPosition > 0) {
      const { line, column } = offsetToLineColumn(value, errorPosition);
      // Highlight from error position to end of the word/line
      const wordAtPos = model.getWordAtPosition({ lineNumber: line, column });
      const endCol = wordAtPos ? wordAtPos.endColumn : column + 1;
      monaco.editor.setModelMarkers(model, "codb-query-error", [
        {
          severity: monaco.MarkerSeverity.Error,
          message: errorMessage ?? "Query error",
          startLineNumber: line,
          startColumn: column,
          endLineNumber: line,
          endColumn: endCol,
        },
      ]);
    } else {
      monaco.editor.setModelMarkers(model, "codb-query-error", []);
    }
  }, [errorPosition, errorMessage, modelPath, value]);

  // Cleanup providers on unmount
  useEffect(() => {
    return () => {
      completionRef.current?.dispose();
      signatureHelpRef.current?.dispose();
    };
  }, []);

  return (
    <MonacoEditor
      language="sql"
      value={value}
      path={modelPath}
      onChange={(v) => onChange(v ?? "")}
      onMount={handleMount}
      theme={resolvedTheme === "dark" ? "codb-dark" : "codb-light"}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        lineHeight: 20,
        padding: { top: 12 },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        wordWrap: "on",
        tabSize: 2,
        renderLineHighlight: "line",
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        quickSuggestions: { other: true, comments: false, strings: false },
        suggestOnTriggerCharacters: true,
        wordBasedSuggestions: "off",
      }}
    />
  );
}
