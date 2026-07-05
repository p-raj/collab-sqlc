import type { TableInfo } from "@/domains/schema/types";
import type { DatabaseType } from "@/domains/connections/engine-registry";
import type { IDisposable, languages } from "monaco-editor";

export type MonacoApi = typeof import("monaco-editor");

export interface LanguagePackContext {
  getTables: () => TableInfo[];
  getDbType: () => DatabaseType | null;
}

export interface LanguagePack {
  monacoLanguage: string;
  setupMonaco?(monaco: MonacoApi): void;
  createCompletionProvider(context: LanguagePackContext): languages.CompletionItemProvider;
  createSignatureHelpProvider?(
    context: LanguagePackContext,
  ): languages.SignatureHelpProvider;
}

export interface RegisteredLanguagePackProviders {
  completion: IDisposable;
  signatureHelp: IDisposable | null;
}
