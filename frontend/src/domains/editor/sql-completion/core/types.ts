/**
 * Suggestion hint types returned by suggestType().
 *
 * Phase 1 output: these describe WHAT to suggest, with no schema knowledge.
 * Phase 2 resolvers consume these to produce Monaco CompletionItems.
 */

export interface TableHint {
    kind: "table";
    schema: string | null;
    localTableNames: string[];
}

export interface ColumnHint {
    kind: "column";
    tableRefs: TableRef[];
    localTableNames: string[];
    qualifiable: boolean;
    context: "insert" | null;
}

export interface QualifiedHint {
    kind: "qualified";
    qualifier: string;
    tableRefs: TableRef[];
    cteColumns: Map<string, string[]>;
}

export interface FunctionHint {
    kind: "function";
    schema: string | null;
    usage: "expression" | "signature" | null;
}

export interface KeywordHint {
    kind: "keyword";
    lastToken: string | null;
}

export interface SchemaHint {
    kind: "schema";
}

export interface DatatypeHint {
    kind: "datatype";
    schema: string | null;
}

export interface JoinHint {
    kind: "join";
    tableRefs: TableRef[];
    schema: string | null;
}

export interface JoinConditionHint {
    kind: "join-condition";
    tableRefs: TableRef[];
    parent: TableRef | null;
}

export interface AliasHint {
    kind: "alias";
    aliases: string[];
}

export interface ValuesHint {
    kind: "values";
    tableRefs: TableRef[];
    /** Explicit column names from INSERT INTO table (col1, col2, ...). Empty if no column list. */
    columns: string[];
    /** 0-based index of the current value position within VALUES (...). */
    position: number;
}

export type SuggestionHint =
    | TableHint
    | ColumnHint
    | QualifiedHint
    | FunctionHint
    | KeywordHint
    | SchemaHint
    | DatatypeHint
    | JoinHint
    | JoinConditionHint
    | AliasHint
    | ValuesHint;

export interface TableRef {
    schema: string | null;
    name: string;
    alias: string | null;
}
