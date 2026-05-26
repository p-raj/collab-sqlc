import type { editor } from "monaco-editor";

/** Rich SQL syntax-highlighting theme for dark mode. */
export const darkTheme: editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "keyword", foreground: "569CD6", fontStyle: "bold" },
    { token: "string", foreground: "CE9178" },
    { token: "string.sql", foreground: "CE9178" },
    { token: "number", foreground: "B5CEA8" },
    { token: "number.float", foreground: "B5CEA8" },
    { token: "comment", foreground: "6A9955", fontStyle: "italic" },
    { token: "comment.sql", foreground: "6A9955", fontStyle: "italic" },
    { token: "type", foreground: "4EC9B0" },
    { token: "predefined.sql", foreground: "DCDCAA" },
    { token: "operator.sql", foreground: "D4D4D4" },
    { token: "operator", foreground: "D4D4D4" },
    { token: "delimiter", foreground: "D4D4D4" },
    { token: "identifier", foreground: "D4D4D4" },
  ],
  colors: {
    "editor.background": "#0A0A0A",
    "editor.foreground": "#D4D4D4",
    "editor.lineHighlightBackground": "#1A1A1A",
    "editor.selectionBackground": "#264F78",
    "editorCursor.foreground": "#D4D4D4",
    "editorLineNumber.foreground": "#505050",
    "editorLineNumber.activeForeground": "#A0A0A0",
  },
};

/** Rich SQL syntax-highlighting theme for light mode. */
export const lightTheme: editor.IStandaloneThemeData = {
  base: "vs",
  inherit: true,
  rules: [
    { token: "keyword", foreground: "0000FF", fontStyle: "bold" },
    { token: "string", foreground: "A31515" },
    { token: "string.sql", foreground: "A31515" },
    { token: "number", foreground: "098658" },
    { token: "number.float", foreground: "098658" },
    { token: "comment", foreground: "008000", fontStyle: "italic" },
    { token: "comment.sql", foreground: "008000", fontStyle: "italic" },
    { token: "type", foreground: "267F99" },
    { token: "predefined.sql", foreground: "795E26" },
    { token: "operator.sql", foreground: "000000" },
    { token: "operator", foreground: "000000" },
    { token: "delimiter", foreground: "000000" },
    { token: "identifier", foreground: "1A1A1A" },
  ],
  colors: {
    "editor.background": "#FFFFFF",
    "editor.foreground": "#1A1A1A",
    "editor.lineHighlightBackground": "#F7F7F7",
    "editor.selectionBackground": "#ADD6FF",
    "editorCursor.foreground": "#1A1A1A",
    "editorLineNumber.foreground": "#B0B0B0",
    "editorLineNumber.activeForeground": "#666666",
  },
};
