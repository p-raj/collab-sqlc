import type { languages } from "monaco-editor";
import type { LanguagePack } from "./types";

const REDIS_COMMANDS = [
  "DBSIZE",
  "EXISTS",
  "GET",
  "HGET",
  "HGETALL",
  "HLEN",
  "LLEN",
  "LRANGE",
  "MGET",
  "SCAN",
  "SCARD",
  "SMEMBERS",
  "STRLEN",
  "TTL",
  "TYPE",
  "XLEN",
  "ZCARD",
  "ZRANGE",
] as const;

function item(
  label: string,
  kind: languages.CompletionItemKind,
  range: languages.CompletionItem["range"],
  detail?: string,
): languages.CompletionItem {
  return {
    label,
    kind,
    detail,
    insertText: label,
    range,
  };
}

export const redisLanguagePack: LanguagePack = {
  monacoLanguage: "redis-command",
  createCompletionProvider: ({ getTables }) => ({
    triggerCharacters: [" ", "\t"],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const beforeCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const hasCommand = beforeCursor.trimStart().includes(" ");
      const suggestions = hasCommand
        ? getTables().map((table) =>
            item(table.table_name, 6 as languages.CompletionItemKind, range, "Redis key"),
          )
        : REDIS_COMMANDS.map((command) =>
            item(command, 14 as languages.CompletionItemKind, range, "Redis command"),
          );
      return { suggestions };
    },
  }),
};
