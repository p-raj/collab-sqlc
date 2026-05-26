/**
 * Monaco CompletionItemProvider for SQL — the integration layer.
 *
 * Wires together:
 *   suggestType() → SuggestionHints → resolveHints() → Monaco CompletionItems
 */

import type { editor, IRange, languages, Position } from "monaco-editor";
import type { TableInfo } from "@/domains/schema/types";
import { suggestType } from "./core/suggest";
import { createCatalog } from "./catalog/catalog";
import type { DatabaseType } from "./catalog/dialect";
import { resolveHints } from "./resolvers/resolve";
import { VARIABLE_TYPES } from "../utils/smart-variables";

const VARIABLE_TYPE_DESCRIPTIONS: Record<string, string> = {
    text: "Auto-quoted string → 'value'",
    number: "Raw numeric → 42",
    boolean: "SQL boolean → TRUE / FALSE",
    date: "Quoted date → '2024-01-15'",
    datetime: "Quoted timestamp → '2024-01-15 09:30:00'",
    list: "Comma-separated quoted → 'a', 'b', 'c'",
};

export function createSqlCompletionProvider(
    getTables: () => TableInfo[],
    getDbType?: () => DatabaseType | null,
): languages.CompletionItemProvider {
    let cachedTables: TableInfo[] | null = null;
    let cachedDbType: DatabaseType | null = null;
    let cachedCatalog: ReturnType<typeof createCatalog> | null = null;

    return {
        triggerCharacters: [".", " ", "(", ",", "=", ":"],

        provideCompletionItems(
            model: editor.ITextModel,
            position: Position,
        ): languages.ProviderResult<languages.CompletionList> {
            const fullText = model.getValue();
            const cursorOffset = model.getOffsetAt(position);

            // Variable type completion: {name:| → suggest types
            const textBefore = fullText.slice(0, cursorOffset);
            const varTypeMatch = textBefore.match(/\{[a-zA-Z_]\w*:([a-zA-Z]*)$/);
            if (varTypeMatch) {
                const typed = varTypeMatch[1]!.toLowerCase();
                const word = model.getWordUntilPosition(position);
                const range: IRange = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn,
                };
                const suggestions: languages.CompletionItem[] = VARIABLE_TYPES
                    .filter((t) => t.startsWith(typed))
                    .map((t, i) => ({
                        label: t,
                        kind: 13 as languages.CompletionItemKind, // Enum
                        detail: VARIABLE_TYPE_DESCRIPTIONS[t],
                        insertText: t,
                        range,
                        sortText: String(i).padStart(2, "0"),
                    }));
                return { suggestions };
            }

            const tables = getTables();
            const dbType = getDbType?.() ?? null;

            // Phase 1: determine what to suggest
            const hints = suggestType(fullText, cursorOffset);
            if (hints.length === 0) return { suggestions: [] };

            // Build catalog from schema data (memoized by reference + dialect)
            if (tables !== cachedTables || dbType !== cachedDbType) {
                cachedCatalog = createCatalog(tables, dbType);
                cachedTables = tables;
                cachedDbType = dbType;
            }
            const catalog = cachedCatalog!;

            // Compute prefix and range for replacement
            const word = model.getWordUntilPosition(position);
            const range: IRange = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };

            // Extract prefix from statement context
            const prefixText = fullText.slice(0, cursorOffset);
            const prefixMatch = prefixText.match(/([A-Za-z_][A-Za-z0-9_$]*)$/);
            const prefix = prefixMatch?.[1] ?? "";

            // Phase 2: resolve hints against catalog
            const suggestions = resolveHints(hints, catalog, prefix, range);

            return { suggestions };
        },
    };
}
