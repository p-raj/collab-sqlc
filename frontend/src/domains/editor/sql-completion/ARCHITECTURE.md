# SQL Completion Engine — Architecture

## Overview

The SQL completion engine provides context-aware autocompletion and function signature help inside Monaco editor instances. It is designed as a **two-phase pipeline**: Phase 1 determines *what kind* of suggestion is needed (grammar analysis), Phase 2 maps those hints into *concrete items* using schema and dialect knowledge.

```
Monaco keystroke
    │
    ▼
┌─────────────────────────────────────────────────┐
│  monaco-provider.ts  (provideCompletionItems)   │
│                                                 │
│  1. Read full editor text + cursor offset       │
│  2. Get current tables from schema store        │
│  3. Build/reuse Catalog (tables + dialect)      │
│  4. Phase 1: suggestType(text, offset)          │
│     → SuggestionHint[]                          │
│  5. Phase 2: resolveHints(hints, catalog, ...)  │
│     → CompletionItem[]                          │
│  6. Return to Monaco                            │
└─────────────────────────────────────────────────┘
```

---

## File Map

```
sql-completion/
├── index.ts                     # Public exports
├── monaco-provider.ts           # Monaco ↔ engine bridge (completion)
├── signature-provider.ts        # Monaco ↔ engine bridge (function signatures)
│
├── core/                        # Phase 1 — grammar/context analysis
│   ├── types.ts                 # SuggestionHint union + TableRef
│   ├── sanitizer.ts             # Strip strings/comments, detect suppression
│   ├── extract-tables.ts        # Tokenizer, table ref extraction, CTE/subquery parsing
│   ├── statement.ts             # SqlStatement — parsed cursor-local state
│   └── suggest.ts               # suggestType() — main Phase 1 entry point
│
├── catalog/                     # Schema + dialect knowledge
│   ├── types.ts                 # Catalog interface, FunctionMeta
│   ├── catalog.ts               # createCatalog() factory
│   ├── dialect.ts               # DialectProfile + getDialect()
│   ├── pg/                      # PostgreSQL: functions, keywords, datatypes
│   └── ch/                      # ClickHouse: functions, keywords, datatypes (stubs)
│
└── resolvers/                   # Phase 2 — hints → Monaco CompletionItems
    └── resolve.ts               # resolveHints() + per-kind resolvers
```

---

## Data Flow: Schema → Completions

The full chain from database schema to completion popup:

```
┌───────────────┐     GET /api/schema      ┌─────────────┐
│  SchemaTree   │ ──────────────────────► │   Backend   │
│  (side panel) │ ◄────────────────────── │  /api/schema│
└───────┬───────┘   TableInfo[] response   └─────────────┘
        │
        ▼
┌───────────────┐   schemas[connectionId] = TableInfo[]
│  Schema Store │   (Zustand, keyed by connection ID)
│  (global)     │
└───────┬───────┘
        │ getTables(connectionId)
        ▼
┌───────────────┐   getCompletionTables callback
│  EditorPage   │ ─────────────────────────────────┐
│               │   getDbType callback              │
└───────────────┘ ─────────────────────────────┐    │
                                               │    │
                                               ▼    ▼
                                    ┌──────────────────────┐
                                    │  SqlEditor component │
                                    │                      │
                                    │  Registers providers │
                                    │  on Monaco mount     │
                                    └──────────┬───────────┘
                                               │
                          createSqlCompletionProvider(getTablesFn, getDbTypeFn)
                          createSqlSignatureHelpProvider(getTablesFn, getDbTypeFn)
                                               │
                                               ▼
                                    ┌──────────────────────┐
                                    │  monaco-provider.ts  │
                                    │                      │
                                    │  On each trigger:    │
                                    │  tables = getTables()│
                                    │  catalog = create(   │
                                    │    tables, dbType)   │
                                    │  hints = suggestType │
                                    │  items = resolveHints│
                                    └──────────────────────┘
```

The catalog is memoized — it only rebuilds when the table array reference or dbType changes.

---

## Phase 1: Context Analysis (`suggestType`)

**Entry point**: `suggestType(fullText: string, cursorOffset: number): SuggestionHint[]`

Phase 1 knows nothing about actual table/column names. It analyzes SQL grammar to determine what *kind* of completion is appropriate at the cursor position.

### Pipeline

```
fullText + cursorOffset
    │
    ▼
new SqlStatement(fullText, cursorOffset)
    │
    ├── sanitizeSqlPrefix(prefix)
    │   └── Blanks strings/comments, detects if cursor is inside one → suppressed
    │
    ├── Isolate current statement (after last ;)
    │
    ├── stripCtes(raw, sanitized)
    │   └── Extracts CTE names + column lists from WITH clause
    │
    ├── tokenize(sanitized)
    │   └── Regex tokenizer → Token[] (value, upper, isIdentifier)
    │
    ├── extractTrailingQualifierParts(tokens)
    │   └── Detects "alias." or "schema.table." at cursor
    │
    └── extractTableRefs(tokens, { withSubqueryColumns: true })
        └── Finds FROM/JOIN/INTO refs + subquery alias columns
            └── Merges subquery columns into cteColumns map
```

### Dispatch Logic

```
suggestType(text, offset)
    │
    ├── if suppressed → []
    │
    ├── if qualifier exists → suggestForQualified()
    │   └── Returns QualifiedHint with qualifier, tableRefs, cteColumns
    │
    ├── if no tokens → keyword + table + schema hints
    │
    └── suggestBasedOnLastToken(lastToken)
        │
        ├── SELECT/DISTINCT     → column + function + keyword + alias
        ├── FROM/JOIN/INTO      → table (+ join hint for JOINs)
        ├── WHERE/HAVING/AND/OR → column + function + keyword
        ├── ON (after JOIN)     → join-condition hint
        ├── SET                 → column (UPDATE SET context)
        ├── BY/OVER             → column + function + keyword
        ├── VALUES/(            → values hint (INSERT) or expression
        ├── RETURNING           → column (from INSERT target)
        ├── AS                  → [] (user is typing alias)
        ├── DDL parens          → datatype hint
        ├── Comma/Operator      → suggestAfterContinuation()
        │   │
        │   ├── SET search_path  → schema hint
        │   ├── INSERT col list  → column hint (INSERT target)
        │   ├── OVER clause      → column + function (partition/order)
        │   ├── VALUES row       → values hint (positional)
        │   └── fallback         → reduceToPrevKeyword → recurse
        │
        └── Identifier          → reduceToPrevKeyword → recurse
```

### Hint Types

| Hint Kind | Meaning | Key Data |
|---|---|---|
| `table` | Suggest table/view names | `schema` scope, `localTableNames` (CTEs) |
| `column` | Suggest column names | `tableRefs`, `qualifiable`, `context` |
| `qualified` | Suggest after `alias.` or `schema.` | `qualifier`, `tableRefs`, `cteColumns` |
| `function` | Suggest SQL functions | `schema`, `usage` (expression/signature) |
| `keyword` | Suggest SQL keywords | `lastToken` for context filtering |
| `schema` | Suggest schema names | — |
| `datatype` | Suggest data types | `schema` |
| `join` | Suggest JOIN target + ON condition | `tableRefs`, `schema` |
| `join-condition` | Suggest ON condition columns | `tableRefs`, `parent` (last JOIN table) |
| `alias` | Suggest table aliases for `alias.` | `aliases` |
| `values` | Suggest INSERT VALUES placeholder | `tableRefs`, `columns`, `position` |

---

## Phase 2: Resolution (`resolveHints`)

**Entry point**: `resolveHints(hints, catalog, prefix, range): CompletionItem[]`

Phase 2 takes the grammar hints and combines them with actual schema data from the catalog to produce Monaco completion items.

### Resolver Map

| Hint Kind | Resolver | What It Produces |
|---|---|---|
| `table` | `resolveTable` | CTE names + catalog tables (schema-scoped if specified) |
| `column` | `resolveColumn` | Columns from referenced tables + alias prefixes when qualifiable |
| `qualified` | `resolveQualified` | CTE/subquery columns → table alias columns → schema.table listing |
| `function` | `resolveFunction` | Built-in functions with signature snippets |
| `keyword` | `resolveKeyword` | Context-filtered SQL keywords |
| `schema` | `resolveSchema` | Schema names from catalog |
| `datatype` | `resolveDatatype` | Data type names from dialect |
| `join` | `resolveJoin` | Candidate tables + ON snippet with FK heuristic |
| `join-condition` | `resolveJoinCondition` | Alias-qualified columns + FK equality snippets |
| `alias` | `resolveAlias` | Table aliases with `.` retrigger |
| `values` | `resolveValues` | Positional column hint (name, type, nullability, default) |

### Resolution Priority (QualifiedHint)

The `resolveQualified` resolver checks in order:
1. **CTE/subquery columns** — if qualifier matches a CTE or subquery alias
2. **Table alias match** — qualifier matches a table ref alias → that table's columns
3. **Direct table name** — qualifier matches a table name → that table's columns
4. **Schema name** — qualifier matches a schema → tables in that schema

---

## Catalog System

The catalog bridges schema data with dialect-specific knowledge.

```
createCatalog(tables: TableInfo[], dbType?: string): Catalog
    │
    ├── tables          — from schema store (real DB tables)
    ├── schemaNames     — derived from tables
    ├── functions       — from DialectProfile (built-in SQL functions)
    ├── datatypes       — from DialectProfile
    ├── getKeywords()   — from DialectProfile (context-aware)
    ├── findTable()     — schema-aware table lookup
    └── getTablesInSchema() — filter by schema
```

### Dialect Profiles

| Dialect | Functions | Keywords | Datatypes |
|---|---|---|---|
| PostgreSQL | Full catalog (aggregate, string, math, date, json, array, window, etc.) | Context-grouped (after SELECT, FROM, WHERE, JOIN, OVER, etc.) | Full PG type list |
| ClickHouse | Stub (empty) | Reuses PG keywords | Stub (empty) |

Default dialect is PostgreSQL when dbType is null/unknown.

---

## SqlStatement: Cursor-Local Parse State

`SqlStatement` is constructed once per completion request and carries all parsed context:

```typescript
SqlStatement {
    wordBeforeCursor: string      // The partial word being typed (prefix)
    tokens: Token[]               // Tokenized SQL before cursor (minus word)
    lastToken: Token | null       // Last meaningful token (drives dispatch)
    tableRefs: TableRef[]         // FROM/JOIN/INTO tables with aliases
    localTableNames: string[]     // CTE names (local "virtual" tables)
    cteColumns: Map<string, string[]>  // CTE + subquery column maps
    qualifier: string | null      // "alias" from "alias.|" or "schema" from "schema.|"
    identifierSchema: string | null
    suppressed: boolean           // Cursor inside string/comment
    textBeforeCursor: string      // Raw text of current statement
    endsWithParen: boolean        // Last token is "("

    // Methods
    isInsert(): boolean
    isUpdate(): boolean
    isCreate(): boolean
    getTables(scope?): TableRef[]      // "full" | "insert" | "before"
    reduceToPrevKeyword(): string | null
    hasKeyword(kw: string): boolean
    lastNTokens(n: number): Token[]
}
```

### `getTables` Scopes

| Scope | Returns | Use Case |
|---|---|---|
| (default) | All table refs | General column suggestions |
| `"full"` | For INSERT: refs after first (subqueries in FROM of INSERT...SELECT) | INSERT...SELECT column suggestions |
| `"insert"` | First ref only (INSERT target) | INSERT column list, VALUES, RETURNING |
| `"before"` | Refs before cursor position | JOIN condition (only preceding tables) |

---

## How to Add a New Suggestion Kind

Follow this checklist when introducing a new expression or context to the completion engine.

### Step 1: Define the Hint Type

Add a new interface to `core/types.ts`:

```typescript
export interface MyNewHint {
    kind: "my-new";
    // Include whatever data Phase 2 will need to resolve
    tableRefs: TableRef[];
    someContext: string;
}
```

Add it to the `SuggestionHint` union:

```typescript
export type SuggestionHint =
    | TableHint
    | ...
    | MyNewHint;
```

### Step 2: Emit the Hint in Phase 1 (`suggest.ts`)

Determine where in the grammar your new context applies.

**Option A — Token-driven**: If triggered by a specific keyword (like `RETURNING`, `VALUES`), add a case in `suggestBasedOnLastToken()`:

```typescript
if (tokenValue === "MY_KEYWORD") {
    return [{ kind: "my-new", tableRefs: stmt.getTables(), someContext: "..." }];
}
```

**Option B — Context detection**: If triggered by a structural pattern (like being inside `OVER (...)` or `VALUES (...)`), write a detection function:

```typescript
function isInMyNewContext(stmt: SqlStatement): boolean {
    // Walk tokens backward, check paren depth, look for marker keywords
}
```

Then call it from `suggestAfterContinuation()` (for commas/operators) or `suggestBasedOnLastToken()` (for keyword entry points). Context checks in `suggestAfterContinuation` are ordered — place yours at the right priority relative to existing checks.

**Priority in `suggestAfterContinuation`**: The order matters when multiple contexts could match the same token pattern. Current order:
1. SET search_path → schema
2. INSERT column list → column
3. OVER clause → column + function
4. VALUES row → values hint
5. Fallback → reduce to previous keyword

### Step 3: Resolve the Hint in Phase 2 (`resolvers/resolve.ts`)

Add a resolver function:

```typescript
function resolveMyNew(
    hint: MyNewHint,
    catalog: Catalog,
    prefix: string,
    range: IRange,
): languages.CompletionItem[] {
    // Look up data from catalog, filter by prefix, return CompletionItems
}
```

Add the case to the switch in `resolveHints()`:

```typescript
case "my-new":
    items.push(...resolveMyNew(hint, catalog, prefix, range));
    break;
```

### Step 4: Add Tests

Tests are critical because the engine is purely functional — every behavior can be unit-tested.

**Phase 1 test** (`core/suggest.test.ts`):
```typescript
it("suggests my-new hint when ...", () => {
    const hints = suggestType("SELECT ... MY_KEYWORD ", sql.length);
    expect(hints).toContainEqual(expect.objectContaining({ kind: "my-new" }));
});
```

**Phase 2 test** (`resolvers/resolve.test.ts`):
```typescript
it("resolves my-new hint to completion items", () => {
    const items = resolve([{ kind: "my-new", tableRefs: [...], someContext: "..." }]);
    expect(items.map(i => i.label)).toContain("expected_item");
});
```

### Step 5: Dialect Considerations

If your new feature needs dialect-specific data (keywords, functions, types):

1. Add entries to `catalog/pg/keywords.ts` (and/or `functions.ts`, `datatypes.ts`)
2. Mirror the structure in `catalog/ch/` (even if stubbed)
3. Add a context case to `getKeywordsForContext()` if keyword suggestions are involved
4. Add the context string to `KeywordContext` type in the dialect profile if new

---

## Editor Integration

The completion engine is a leaf dependency — it has no knowledge of React, editor state, or connections.

```
                    ┌──────────────────────────┐
                    │    EditorWorkspaceLayout  │
                    │                          │
                    │  Provides: EditorContext  │
                    │  + SavedQueryContext      │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │       EditorPage          │
                    │                          │
                    │  Reads: connections store │
                    │         schema store      │
                    │         editor context    │
                    │                          │
                    │  Creates: getTablesFn     │
                    │           getDbTypeFn     │
                    └────────────┬─────────────┘
                                 │ props
                    ┌────────────▼─────────────┐
                    │       SqlEditor           │
                    │                          │
                    │  Monaco instance          │
                    │  Registers: completion +  │
                    │  signature providers      │
                    │  on mount                 │
                    └──────────────────────────┘
```

### Editor State (useReducer + Context)

```
EditorState {
    tabs: Tab[]
    activeTabId: string
    isExecuting: boolean
}

Tab {
    id, title, sql, connectionId
    result, error, errorPosition
    executedSql, savedSql, savedQueryId
    variables, writeMode, schemaView
    explainPlan, explainQuery, folderName
}
```

Actions: `ADD_TAB`, `CLOSE_TAB`, `SET_ACTIVE_TAB`, `UPDATE_SQL`, `SET_CONNECTION`, `SET_RESULT`, `SET_ERROR`, `SET_EXPLAIN_RESULT`, `SET_VARIABLE`, `MARK_SAVED`, `LINK_SAVED_QUERY`, `DUPLICATE_TAB`, `TOGGLE_WRITE_MODE`, etc.

### Query Execution Flow

```
User clicks Run (or Cmd+Enter)
    │
    ▼
EditorContext.execute(sql)
    │
    ├── Resolve connection (tab.connectionId or activeConnectionId)
    ├── Smart variable substitution (see below)
    ├── dispatch SET_EXECUTING
    │
    ├── POST /api/queries/execute { sql, connectionId, writeMode }
    │
    ├── On success: dispatch SET_RESULT { columns, rows, executionTime }
    └── On failure: dispatch SET_ERROR { message, position }
                                │
                                ▼
                    ResultsArea renders AG Grid (data)
                    or error message with Monaco marker
```

---

## Smart Variables

SQL template parameters that provide type-aware substitution and matching input controls.

### Syntax

Two syntaxes coexist:

| Syntax | Example | Type | Input Control |
|---|---|---|---|
| `{name:type}` | `{status:text}` | Explicit | Type-specific |
| `{name}` | `{limit}` | `text` (default) | Text input |
| `$name` | `$user_id` | Raw interpolation | Text input |

If both `{name:type}` and `$name` exist for the same name, the smart variable still defines the input metadata, but each SQL token keeps its own substitution behavior: `{name:type}` is formatted by type and `$name` is interpolated raw.

### Supported Types

| Type | Input Control | SQL Output | Example |
|---|---|---|---|
| `text` | Text input | `'quoted'` | `'active'` |
| `number` | Number input | Raw numeric | `42` |
| `boolean` | TRUE/FALSE dropdown | `TRUE` / `FALSE` | `TRUE` |
| `date` | Native date picker | `'YYYY-MM-DD'` | `'2024-01-15'` |
| `datetime` | Native datetime picker | `'YYYY-MM-DD HH:mm:ss'` | `'2024-01-15 09:30:00'` |
| `list` | Wide text input | Comma-separated quoted | `'in', 'out', 'pending'` |

Empty values substitute as `NULL`. Invalid numbers and unrecognized booleans also produce `NULL`.

### Data Flow

```
SQL in editor:
  SELECT * FROM users
  WHERE status IN ({statuses:list}) AND age > {min_age:number}
         │
         ▼
  extractSmartVariables(sql)
  → [ { name: "statuses", type: "list",   token: "{statuses:list}" },
      { name: "min_age",  type: "number", token: "{min_age:number}" } ]
         │
         ├──► VariableBar renders:
         │    [statuses] list  [ in, out, pending ]
         │    [min_age]  123   [ 18                ]
         │
         │    User input stored in tab.variables: Record<string, string>
         │    (raw text, type-agnostic — formatting happens at substitution time)
         │
         └──► On Run: substituteSmartVariables(sql, vars, values)
                1. Sanitize SQL so strings/comments/dollar-quotes are ignored
                2. Walk actual token occurrences in source order
                3. `{name:type}` → formatForSql(rawValue, type)
                4. `$name` → raw user input, unchanged

  Result SQL sent to backend:
    SELECT * FROM users
    WHERE status IN ('in', 'out', 'pending') AND age > 18
```

### File Map

| File | Purpose |
|---|---|
| `utils/smart-variables.ts` | Core: `extractSmartVariables()`, `formatForSql()`, `substituteSmartVariables()` |
| `utils/smart-variables.test.ts` | 49 tests covering parsing, formatting, substitution, and ignored literal/comment regions |
| `components/VariableBar.tsx` | UI: renders type-appropriate input per detected variable |
| `hooks/editor-context.tsx` | Wiring: calls extract + substitute on execute/explain paths |

### Key Design Decisions

- **Type info lives in the SQL, not in state.** `tab.variables` is just `Record<string, string>` storing raw user input. The type is re-parsed from SQL on every render/execute. This means renaming `{x:number}` to `{x:text}` in the SQL immediately changes the input control and substitution behavior — no state migration needed.
- **Legacy variables stay raw.** `$name` is direct string interpolation and is never auto-quoted or type-formatted.
- **Client-side only.** The backend receives already-substituted plain SQL. No server changes needed.
- **Sanitized and overlap-safe.** Substitution ignores strings, comments, and dollar-quoted bodies, then walks matched tokens by source position so `$id` and `$id2` cannot collide.

---

## Signature Help

Separate from completion, the signature provider shows function parameter hints:

```
User types "count(" or "," inside function args
    │
    ▼
signature-provider.ts
    │
    ├── findFunctionContext(text) → { name, argIndex }
    ├── catalog.functions lookup by name
    └── Return SignatureHelp with activeParameter = argIndex
```

Trigger characters: `(` and `,`.

---

## Testing Strategy

The engine is purely functional — no DOM, no side effects, no mocking needed.

| Layer | Test File | What's Tested |
|---|---|---|
| Sanitizer | `core/sanitizer.test.ts` | String/comment blanking, suppression, statement boundaries |
| Tokenizer + extraction | `core/extract-tables.test.ts` | Table refs, CTE parsing, subquery aliases, select columns |
| Phase 1 hints | `core/suggest.test.ts` | Every grammar context → expected hint kinds |
| Phase 2 resolution | `resolvers/resolve.test.ts` | Hint + catalog → expected completion items |
| Catalog | `catalog/catalog.test.ts` | Table lookup, schema scoping, dialect dispatch |
| Signatures | `signature-provider.test.ts` | Function context detection, parameter indexing |
| Monaco bridge | `monaco-provider.test.ts` | Trigger characters |
| Smart variables | `utils/smart-variables.test.ts` | Parsing, type formatting, substitution, overlap safety |

Run all: `npx vitest run src/domains/editor/sql-completion/`
