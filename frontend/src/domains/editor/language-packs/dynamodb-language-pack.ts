import type { languages } from "monaco-editor";
import type { LanguagePack, MonacoApi } from "./types";

const PARTIQL_KEYWORDS = [
  "ALL",
  "ASC",
  "BY",
  "SELECT",
  "FROM",
  "WHERE",
  "ORDER",
  "LIMIT",
  "INSERT",
  "INTO",
  "UPDATE",
  "DELETE",
  "RETURNING",
  "OLD",
  "NEW",
  "MODIFIED",
  "SET",
  "REMOVE",
  "VALUE",
] as const;

const PARTIQL_OPERATORS = [
  "AND",
  "BETWEEN",
  "DESC",
  "IN",
  "NOT",
  "OR",
] as const;

const PARTIQL_FUNCTIONS = ["list_append", "set_add", "set_delete"] as const;

const PARTIQL_SNIPPETS = [
  {
    label: "SELECT by key",
    insertText: 'SELECT *\nFROM "$1"\nWHERE $2 = ?',
    detail: "DynamoDB PartiQL key query",
  },
  {
    label: "SELECT limited",
    insertText: 'SELECT *\nFROM "$1"\nLIMIT $2',
    detail: "DynamoDB PartiQL limited read",
  },
  {
    label: "INSERT item",
    insertText: 'INSERT INTO "$1" VALUE {\n  \'$2\': $3\n}',
    detail: "DynamoDB PartiQL insert item",
  },
  {
    label: "UPDATE returning new",
    insertText: 'UPDATE "$1"\nSET $2 = ?\nWHERE $3 = ?\nRETURNING ALL NEW *',
    detail: "DynamoDB PartiQL update item",
  },
  {
    label: "DELETE by key",
    insertText: 'DELETE FROM "$1"\nWHERE $2 = ?',
    detail: "DynamoDB PartiQL delete item",
  },
] as const;

let partiqlRegistered = false;

function completion(
  label: string,
  kind: languages.CompletionItemKind,
  range: languages.CompletionItem["range"],
  detail?: string,
  insertText?: string,
  insertTextRules?: languages.CompletionItemInsertTextRule,
): languages.CompletionItem {
  return {
    label,
    kind,
    detail,
    insertText: insertText ?? label,
    insertTextRules,
    range,
  };
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function setupPartiql(monaco: MonacoApi): void {
  if (partiqlRegistered) return;
  if (!monaco.languages.getLanguages().some((language) => language.id === "partiql")) {
    monaco.languages.register({ id: "partiql" });
  }
  monaco.languages.setMonarchTokensProvider("partiql", {
    defaultToken: "",
    tokenPostfix: ".partiql",
    ignoreCase: true,
    keywords: [...PARTIQL_KEYWORDS, ...PARTIQL_OPERATORS],
    functions: PARTIQL_FUNCTIONS,
    tokenizer: {
      root: [
        [/"([^"]|"")*"/, "string.quote"],
        [/'([^']|'')*'/, "string"],
        [/<<|>>|\[|\]|\{|\}|\(|\)|,|\./, "delimiter"],
        [/[<>]=?|=|\+|-|\*|\//, "operator"],
        [/\b\d+(\.\d+)?\b/, "number"],
        [
          /[a-zA-Z_][\w$]*/,
          {
            cases: {
              "@keywords": "keyword",
              "@functions": "predefined",
              "@default": "identifier",
            },
          },
        ],
        [/[;?]/, "delimiter"],
        [/\s+/, "white"],
      ],
    },
  });
  partiqlRegistered = true;
}

export const dynamodbLanguagePack: LanguagePack = {
  monacoLanguage: "partiql",
  setupMonaco: setupPartiql,
  createCompletionProvider: ({ getTables }) => ({
    triggerCharacters: [" ", ".", '"'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const tables = getTables();
      const attributes = new Map<string, { dataType: string; isPrimaryKey: boolean }>();
      for (const table of tables) {
        for (const column of table.columns) {
          const existing = attributes.get(column.name);
          attributes.set(column.name, {
            dataType: existing?.dataType ?? column.data_type,
            isPrimaryKey: Boolean(existing?.isPrimaryKey || column.is_primary_key),
          });
        }
      }
      const sortedAttributes = Array.from(attributes.entries()).sort(([a, aInfo], [b, bInfo]) => {
        if (aInfo.isPrimaryKey !== bInfo.isPrimaryKey) {
          return aInfo.isPrimaryKey ? -1 : 1;
        }
        return a.localeCompare(b);
      });

      return {
        suggestions: [
          ...PARTIQL_KEYWORDS.map((keyword) =>
            completion(keyword, 14 as languages.CompletionItemKind, range, "PartiQL keyword"),
          ),
          ...PARTIQL_OPERATORS.map((operator) =>
            completion(operator, 14 as languages.CompletionItemKind, range, "PartiQL operator"),
          ),
          ...PARTIQL_FUNCTIONS.map((fn) =>
            completion(fn, 3 as languages.CompletionItemKind, range, "DynamoDB PartiQL function"),
          ),
          ...PARTIQL_SNIPPETS.map((snippet) =>
            completion(
              snippet.label,
              27 as languages.CompletionItemKind,
              range,
              snippet.detail,
              snippet.insertText,
              4 as languages.CompletionItemInsertTextRule,
            ),
          ),
          ...tables.map((table) =>
            completion(
              table.table_name,
              6 as languages.CompletionItemKind,
              range,
              "DynamoDB table",
              quoteIdentifier(table.table_name),
            ),
          ),
          ...sortedAttributes.map(([name, info]) =>
            completion(
              name,
              5 as languages.CompletionItemKind,
              range,
              info.isPrimaryKey ? `${info.dataType} primary key` : info.dataType,
            ),
          ),
        ],
      };
    },
  }),
};
