/**
 * Monaco SQL completion provider powered by the schema store.
 * Provides table and column name suggestions based on live schema data.
 */
import type { languages, editor, Position, IRange } from "monaco-editor";
import type { TableInfo } from "@/domains/schema/types";

export function createSchemaCompletionProvider(
  getTables: () => TableInfo[],
): languages.CompletionItemProvider {
  return {
    triggerCharacters: [".", " "],

    provideCompletionItems(
      model: editor.ITextModel,
      position: Position,
    ): languages.ProviderResult<languages.CompletionList> {
      const tables = getTables();
      if (tables.length === 0) return { suggestions: [] };

      const word = model.getWordUntilPosition(position);
      const range: IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      // Check if we're after a dot (table.column completion)
      const lineContent = model.getLineContent(position.lineNumber);
      const beforeCursor = lineContent.substring(0, position.column - 1);
      const dotMatch = beforeCursor.match(/(\w+)\.\s*$/);

      if (dotMatch) {
        const prefix = dotMatch[1]!.toLowerCase();
        // Find table matching the prefix
        const matchingTable = tables.find(
          (t) =>
            t.table_name.toLowerCase() === prefix ||
            `${t.schema_name}.${t.table_name}`.toLowerCase() === prefix,
        );

        if (matchingTable) {
          return {
            suggestions: matchingTable.columns.map((col) => ({
              label: col.name,
              kind: 5 as languages.CompletionItemKind, // Field
              detail: `${col.data_type}${col.is_nullable ? " (nullable)" : ""}`,
              documentation: col.comment ?? undefined,
              insertText: col.name,
              range,
              sortText: col.is_primary_key ? `0_${col.name}` : `1_${col.name}`,
            })),
          };
        }
      }

      // Default: suggest table names and schema-qualified table names
      const suggestions: languages.CompletionItem[] = [];

      for (const table of tables) {
        suggestions.push({
          label: table.table_name,
          kind: 1 as languages.CompletionItemKind, // Text -> we use numeric to avoid importing the enum
          detail: `table · ${table.columns.length} columns`,
          documentation: table.comment ?? undefined,
          insertText: table.table_name,
          range,
        });

        // Schema-qualified name
        const qualified = `${table.schema_name}.${table.table_name}`;
        suggestions.push({
          label: qualified,
          kind: 1 as languages.CompletionItemKind,
          detail: `${table.columns.length} columns`,
          insertText: qualified,
          range,
          sortText: `z_${qualified}`, // sort after plain names
        });
      }

      return { suggestions };
    },
  };
}
