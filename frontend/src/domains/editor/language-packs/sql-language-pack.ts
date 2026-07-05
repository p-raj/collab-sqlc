import { createSqlCompletionProvider, createSqlSignatureHelpProvider } from "../sql-completion";
import type { LanguagePack } from "./types";

export const sqlLanguagePack: LanguagePack = {
  monacoLanguage: "sql",
  createCompletionProvider: ({ getTables, getDbType }) =>
    createSqlCompletionProvider(getTables, getDbType),
  createSignatureHelpProvider: ({ getTables, getDbType }) =>
    createSqlSignatureHelpProvider(getTables, getDbType),
};
