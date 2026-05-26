/**
 * Resolver — converts SuggestionHints into Monaco CompletionItems.
 *
 * This is Phase 2: pure data lookup against the Catalog.
 * Each hint type has a dedicated resolution function.
 */

import type { languages, IRange } from "monaco-editor";
import type { SuggestionHint, TableRef } from "../core/types";
import type { Catalog } from "../catalog/types";
import type { TableInfo } from "@/domains/schema/types";

/** Monaco CompletionItemKind numeric values. */
const Kind = {
    Module: 0,
    Class: 1,
    Method: 2,
    Function: 3,
    Field: 5,
    Variable: 6,
    Keyword: 14,
    Snippet: 27,
    TypeParameter: 24,
} as const;

function matchesPrefix(value: string, prefix: string): boolean {
    return prefix.length === 0 || value.toLowerCase().startsWith(prefix.toLowerCase());
}

export function resolveHints(
    hints: SuggestionHint[],
    catalog: Catalog,
    prefix: string,
    range: IRange,
): languages.CompletionItem[] {
    const items: languages.CompletionItem[] = [];

    for (const hint of hints) {
        switch (hint.kind) {
            case "table":
                items.push(...resolveTable(hint.schema, hint.localTableNames, catalog, prefix, range));
                break;
            case "column":
                items.push(...resolveColumn(hint.tableRefs, hint.localTableNames, hint.qualifiable, hint.context, catalog, prefix, range));
                break;
            case "qualified":
                items.push(...resolveQualified(hint.qualifier, hint.tableRefs, hint.cteColumns, catalog, prefix, range));
                break;
            case "function":
                items.push(...resolveFunction(hint.schema, hint.usage, catalog, prefix, range));
                break;
            case "keyword":
                items.push(...resolveKeyword(hint.lastToken, catalog, prefix, range));
                break;
            case "schema":
                items.push(...resolveSchema(catalog, prefix, range));
                break;
            case "datatype":
                items.push(...resolveDatatype(hint.schema, catalog, prefix, range));
                break;
            case "join":
                items.push(...resolveJoin(hint.tableRefs, hint.schema, catalog, prefix, range));
                break;
            case "join-condition":
                items.push(...resolveJoinCondition(hint.tableRefs, hint.parent, catalog, prefix, range));
                break;
            case "alias":
                items.push(...resolveAlias(hint.aliases, prefix, range));
                break;
            case "values":
                items.push(...resolveValues(hint.tableRefs, hint.columns, hint.position, catalog, range));
                break;
        }
    }

    // Deduplicate by label+kind to guard against any upstream duplication
    const seen = new Set<string>();
    return items.filter((item) => {
        const key = `${item.kind}::${typeof item.label === "string" ? item.label : item.label.label}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function resolveTable(
    schema: string | null,
    localTableNames: string[],
    catalog: Catalog,
    prefix: string,
    range: IRange,
): languages.CompletionItem[] {
    const items: languages.CompletionItem[] = [];

    // CTE / local table names first
    for (const name of localTableNames) {
        if (matchesPrefix(name, prefix)) {
            items.push({
                label: name,
                kind: Kind.Class,
                detail: "cte",
                insertText: name,
                range,
                sortText: `0a_${name}`,
            });
        }
    }

    // Schema tables
    const tables = schema ? catalog.getTablesInSchema(schema) : catalog.tables;
    for (const table of tables) {
        if (matchesPrefix(table.table_name, prefix)) {
            items.push({
                label: table.table_name,
                kind: Kind.Class,
                detail: `${table.schema_name} · ${table.columns.length} cols`,
                documentation: table.comment ?? undefined,
                insertText: table.table_name,
                range,
                sortText: `0b_${table.table_name}`,
            });
        }
    }

    return items;
}

function resolveColumn(
    tableRefs: TableRef[],
    localTableNames: string[],
    qualifiable: boolean,
    _context: "insert" | null,
    catalog: Catalog,
    prefix: string,
    range: IRange,
): languages.CompletionItem[] {
    const items: languages.CompletionItem[] = [];
    const seen = new Set<string>();

    for (const ref of tableRefs) {
        const tableName = ref.schema ? `${ref.schema}.${ref.name}` : ref.name;

        // Check if it's a CTE (no columns available from catalog)
        if (localTableNames.includes(ref.name)) continue;

        const table = catalog.findTable(tableName);
        if (!table) continue;

        const sourceLabel = ref.alias ?? ref.name;

        for (const col of table.columns) {
            if (!matchesPrefix(col.name, prefix)) continue;

            const key = `${sourceLabel}.${col.name}`;
            if (seen.has(key)) continue;
            seen.add(key);

            items.push({
                label: col.name,
                kind: Kind.Field,
                detail: `${sourceLabel} · ${col.data_type}${col.is_nullable ? " · nullable" : ""}`,
                documentation: col.comment ?? undefined,
                insertText: col.name,
                range,
                sortText: col.is_primary_key ? `0a_${col.name}` : `0b_${col.name}`,
            });
        }
    }

    // If qualifiable, also add table alias prefixes for quick qualified access
    if (qualifiable && tableRefs.length > 1) {
        for (const ref of tableRefs) {
            const label = ref.alias ?? ref.name;
            if (matchesPrefix(label, prefix)) {
                items.push({
                    label: label,
                    kind: Kind.Variable,
                    detail: "table reference",
                    insertText: `${label}.`,
                    command: { id: "editor.action.triggerSuggest", title: "Trigger" },
                    range,
                    sortText: `0c_${label}`,
                });
            }
        }
    }

    return items;
}

function resolveQualified(
    qualifier: string,
    tableRefs: TableRef[],
    cteColumns: Map<string, string[]>,
    catalog: Catalog,
    prefix: string,
    range: IRange,
): languages.CompletionItem[] {
    const normalized = qualifier.toLowerCase();

    // Check if qualifier is a CTE with known columns
    const cteCols = cteColumns.get(normalized);
    if (cteCols) {
        return cteCols
            .filter((col) => matchesPrefix(col, prefix))
            .map((col) => ({
                label: col,
                kind: Kind.Field as languages.CompletionItemKind,
                detail: `${qualifier} · derived column`,
                insertText: col,
                range,
                sortText: `0a_${col}`,
            }));
    }

    // Check if qualifier is a table alias or direct table reference
    const matchedRef = tableRefs.find(
        (ref) =>
            ref.alias?.toLowerCase() === normalized
            || ref.name.toLowerCase() === normalized,
    );

    if (matchedRef) {
        const tableName = matchedRef.schema ? `${matchedRef.schema}.${matchedRef.name}` : matchedRef.name;
        const table = catalog.findTable(tableName);
        if (table) {
            return createColumnItems(table, prefix, range, matchedRef.alias ?? table.table_name);
        }
    }

    // Check if qualifier is a direct table name
    const directTable = catalog.findTable(qualifier);
    if (directTable) {
        return createColumnItems(directTable, prefix, range, directTable.table_name);
    }

    // Check if qualifier is a schema name → suggest tables in that schema
    const schemaTables = catalog.getTablesInSchema(qualifier);
    if (schemaTables.length > 0) {
        return schemaTables
            .filter((t) => matchesPrefix(t.table_name, prefix))
            .map((t) => ({
                label: t.table_name,
                kind: Kind.Class as languages.CompletionItemKind,
                detail: `${t.schema_name} · ${t.columns.length} cols`,
                documentation: t.comment ?? undefined,
                insertText: t.table_name,
                range,
                sortText: `0b_${t.table_name}`,
            }));
    }

    return [];
}

function createColumnItems(
    table: TableInfo,
    prefix: string,
    range: IRange,
    sourceLabel: string,
): languages.CompletionItem[] {
    return table.columns
        .filter((col) => matchesPrefix(col.name, prefix))
        .map((col) => ({
            label: col.name,
            kind: Kind.Field as languages.CompletionItemKind,
            detail: `${sourceLabel} · ${col.data_type}${col.is_nullable ? " · nullable" : ""}`,
            documentation: col.comment ?? undefined,
            insertText: col.name,
            range,
            sortText: col.is_primary_key ? `0a_${col.name}` : `0b_${col.name}`,
        }));
}

function resolveFunction(
    schema: string | null,
    usage: "expression" | "signature" | null,
    catalog: Catalog,
    prefix: string,
    range: IRange,
): languages.CompletionItem[] {
    if (schema) return []; // schema-qualified functions not in our catalog yet

    return catalog.functions
        .filter((fn) => matchesPrefix(fn.name, prefix))
        .map((fn) => ({
            label: fn.name,
            kind: Kind.Function as languages.CompletionItemKind,
            detail: fn.signature,
            documentation: `${fn.description} (${fn.category})`,
            insertText: usage === "signature" ? fn.name : `${fn.name}($0)`,
            insertTextRules: usage === "signature" ? undefined : 4, // InsertAsSnippet
            command: usage === "signature" ? undefined : { id: "editor.action.triggerSuggest", title: "Trigger" },
            range,
            sortText: `1a_${fn.name}`,
        }));
}

function resolveKeyword(
    lastToken: string | null,
    catalog: Catalog,
    prefix: string,
    range: IRange,
): languages.CompletionItem[] {
    const keywords = catalog.getKeywords(lastToken);

    return keywords
        .filter((kw) => matchesPrefix(kw, prefix))
        .map((kw) => ({
            label: kw,
            kind: Kind.Keyword as languages.CompletionItemKind,
            insertText: kw,
            range,
            sortText: `2a_${kw}`,
        }));
}

function resolveSchema(
    catalog: Catalog,
    prefix: string,
    range: IRange,
): languages.CompletionItem[] {
    return catalog.schemaNames
        .filter((name) => matchesPrefix(name, prefix))
        .map((name) => ({
            label: name,
            kind: Kind.Module as languages.CompletionItemKind,
            detail: "schema",
            insertText: name,
            range,
            sortText: `0a_${name}`,
        }));
}

function resolveDatatype(
    schema: string | null,
    catalog: Catalog,
    prefix: string,
    range: IRange,
): languages.CompletionItem[] {
    if (schema) return []; // schema-qualified types not in our catalog yet

    return catalog.datatypes
        .filter((dt) => matchesPrefix(dt, prefix))
        .map((dt) => ({
            label: dt,
            kind: Kind.TypeParameter as languages.CompletionItemKind,
            detail: "data type",
            insertText: dt,
            range,
            sortText: `1b_${dt}`,
        }));
}

function resolveJoin(
    tableRefs: TableRef[],
    schema: string | null,
    catalog: Catalog,
    prefix: string,
    range: IRange,
): languages.CompletionItem[] {
    // Smart JOIN suggestions using FK heuristics
    // For now: suggest tables with ON clause snippet using naming heuristics
    const items: languages.CompletionItem[] = [];
    const existingTableNames = new Set(tableRefs.map((ref) => ref.name.toLowerCase()));
    const tables = schema ? catalog.getTablesInSchema(schema) : catalog.tables;

    for (const table of tables) {
        if (!matchesPrefix(table.table_name, prefix)) continue;
        if (existingTableNames.has(table.table_name.toLowerCase())) continue;

        // Try to find a join condition via FK column naming heuristic
        const joinSnippet = buildJoinSnippet(table, tableRefs, catalog);

        if (joinSnippet) {
            items.push({
                label: `${table.table_name} ON ${joinSnippet.preview}`,
                kind: Kind.Snippet as languages.CompletionItemKind,
                detail: `${table.schema_name} · smart join`,
                insertText: `${table.table_name} ON ${joinSnippet.snippet}`,
                insertTextRules: 4, // InsertAsSnippet
                range,
                sortText: `0a_${table.table_name}`,
            });
        }
    }

    return items;
}

interface JoinSnippet {
    preview: string;
    snippet: string;
}

function buildJoinSnippet(
    targetTable: TableInfo,
    existingRefs: TableRef[],
    catalog: Catalog,
): JoinSnippet | null {
    // Heuristic: look for columns in targetTable that match "existing_table_id" or "existing_table_name_id"
    for (const ref of existingRefs) {
        const sourceName = ref.schema ? `${ref.schema}.${ref.name}` : ref.name;
        const sourceTable = catalog.findTable(sourceName);
        if (!sourceTable) continue;

        const sourceAlias = ref.alias ?? ref.name;
        const sourceNameLower = ref.name.toLowerCase();

        // Pattern 1: targetTable has a column like "source_name_id" that references source's PK
        for (const col of targetTable.columns) {
            const colLower = col.name.toLowerCase();
            // Match: user_id → users, order_id → orders, etc.
            if (colLower === `${depluralize(sourceNameLower)}_id` || colLower === `${sourceNameLower}_id`) {
                const pk = sourceTable.columns.find((c) => c.is_primary_key);
                if (pk) {
                    const targetAlias = targetTable.table_name;
                    return {
                        preview: `${targetAlias}.${col.name} = ${sourceAlias}.${pk.name}`,
                        snippet: `${targetAlias}.${col.name} = ${sourceAlias}.${pk.name}`,
                    };
                }
            }
        }

        // Pattern 2: sourceTable has a column like "target_name_id" that references target's PK
        for (const col of sourceTable.columns) {
            const colLower = col.name.toLowerCase();
            const targetNameLower = targetTable.table_name.toLowerCase();
            if (colLower === `${depluralize(targetNameLower)}_id` || colLower === `${targetNameLower}_id`) {
                const pk = targetTable.columns.find((c) => c.is_primary_key);
                if (pk) {
                    return {
                        preview: `${sourceAlias}.${col.name} = ${targetTable.table_name}.${pk.name}`,
                        snippet: `${sourceAlias}.${col.name} = ${targetTable.table_name}.${pk.name}`,
                    };
                }
            }
        }
    }

    return null;
}

/** Naive depluralize: remove trailing 's' for FK heuristic matching. */
function depluralize(name: string): string {
    if (name.endsWith("ies")) return name.slice(0, -3) + "y";
    if (name.endsWith("ses") || name.endsWith("xes") || name.endsWith("zes")) return name.slice(0, -2);
    if (name.endsWith("s") && !name.endsWith("ss")) return name.slice(0, -1);
    return name;
}

function resolveJoinCondition(
    tableRefs: TableRef[],
    parent: TableRef | null,
    catalog: Catalog,
    prefix: string,
    range: IRange,
): languages.CompletionItem[] {
    const items: languages.CompletionItem[] = [];

    // Suggest alias.column patterns for join conditions
    for (const ref of tableRefs) {
        const label = ref.alias ?? ref.name;
        if (matchesPrefix(label, prefix)) {
            items.push({
                label,
                kind: Kind.Variable as languages.CompletionItemKind,
                detail: "join target",
                insertText: `${label}.`,
                command: { id: "editor.action.triggerSuggest", title: "Trigger" },
                range,
                sortText: `0a_${label}`,
            });
        }
    }

    // If we have parent context, suggest full join conditions
    if (parent && tableRefs.length >= 2) {
        const parentName = parent.schema ? `${parent.schema}.${parent.name}` : parent.name;
        const parentTable = catalog.findTable(parentName);
        if (!parentTable) return items;

        const parentAlias = parent.alias ?? parent.name;
        const suggestedPairs = new Set<string>();

        // First pass: FK-based join conditions (high confidence)
        for (const ref of tableRefs) {
            if (isSameRef(ref, parent)) continue;
            const otherName = ref.schema ? `${ref.schema}.${ref.name}` : ref.name;
            const otherTable = catalog.findTable(otherName);
            if (!otherTable) continue;
            const otherAlias = ref.alias ?? ref.name;

            addFkJoinConditions(parentTable, parentAlias, otherTable, otherAlias, catalog, prefix, range, items, suggestedPairs);
            addFkJoinConditions(otherTable, otherAlias, parentTable, parentAlias, catalog, prefix, range, items, suggestedPairs);
        }

        // Second pass: naming heuristic (fallback for tables without FKs)
        for (const ref of tableRefs) {
            if (isSameRef(ref, parent)) continue;
            const otherName = ref.schema ? `${ref.schema}.${ref.name}` : ref.name;
            const otherTable = catalog.findTable(otherName);
            if (!otherTable) continue;
            const otherAlias = ref.alias ?? ref.name;

            for (const parentCol of parentTable.columns) {
                for (const otherCol of otherTable.columns) {
                    const pairKey = `${parentCol.name}=${otherCol.name}`;
                    if (suggestedPairs.has(pairKey)) continue;
                    if (isLikelyJoinPair(parentCol.name, parent.name, otherCol.name, ref.name)) {
                        const text = `${parentAlias}.${parentCol.name} = ${otherAlias}.${otherCol.name}`;
                        if (matchesPrefix(text, prefix) || matchesPrefix(parentAlias, prefix)) {
                            items.push({
                                label: text,
                                kind: Kind.Snippet as languages.CompletionItemKind,
                                detail: "join condition (naming)",
                                insertText: text,
                                range,
                                sortText: `0b_${text}`,
                            });
                        }
                    }
                }
            }
        }
    }

    return items;
}

/** Add join conditions based on FK references between two tables. */
function addFkJoinConditions(
    sourceTable: TableInfo,
    sourceAlias: string,
    targetTable: TableInfo,
    targetAlias: string,
    catalog: Catalog,
    prefix: string,
    range: IRange,
    items: languages.CompletionItem[],
    suggestedPairs: Set<string>,
): void {
    for (const col of sourceTable.columns) {
        if (!col.foreign_key) continue;

        // Parse FK ref: "schema.table.column"
        const parts = col.foreign_key.split(".");
        if (parts.length !== 3) continue;

        const fkTable = catalog.findTable(`${parts[0]}.${parts[1]}`);
        if (!fkTable || fkTable !== targetTable) continue;

        const fkColName = parts[2]!;
        const pairKey = `${col.name}=${fkColName}`;
        if (suggestedPairs.has(pairKey)) continue;
        suggestedPairs.add(pairKey);

        const text = `${sourceAlias}.${col.name} = ${targetAlias}.${fkColName}`;
        if (matchesPrefix(text, prefix) || matchesPrefix(sourceAlias, prefix)) {
            items.push({
                label: text,
                kind: Kind.Snippet as languages.CompletionItemKind,
                detail: "join condition (fk)",
                insertText: text,
                range,
                sortText: `0a_${text}`,
            });
        }
    }
}

function isLikelyJoinPair(
    col1: string,
    table1: string,
    col2: string,
    table2: string,
): boolean {
    const c1 = col1.toLowerCase();
    const c2 = col2.toLowerCase();

    // Same PK name on both sides (e.g., id = id is not useful, but user_id = id is)
    if (c1 === c2 && c1 !== "id") return true;

    // col1 is "table2_id" and col2 is a PK-like name, or vice versa
    const t1 = depluralize(table1.toLowerCase());
    const t2 = depluralize(table2.toLowerCase());

    if (c1 === `${t2}_id` && (c2 === "id" || c2 === `${t2}_id`)) return true;
    if (c2 === `${t1}_id` && (c1 === "id" || c1 === `${t1}_id`)) return true;

    return false;
}

function isSameRef(a: TableRef, b: TableRef): boolean {
    return a.name === b.name && a.schema === b.schema && a.alias === b.alias;
}

function resolveAlias(
    aliases: string[],
    prefix: string,
    range: IRange,
): languages.CompletionItem[] {
    return aliases
        .filter((a, i, arr) => arr.indexOf(a) === i) // unique
        .filter((a) => matchesPrefix(a, prefix))
        .map((a) => ({
            label: a,
            kind: Kind.Variable as languages.CompletionItemKind,
            detail: "table alias",
            insertText: `${a}.`,
            command: { id: "editor.action.triggerSuggest", title: "Trigger" },
            range,
            sortText: `0a_${a}`,
        }));
}

function resolveValues(
    tableRefs: TableRef[],
    insertColumns: string[],
    position: number,
    catalog: Catalog,
    range: IRange,
): languages.CompletionItem[] {
    // Find the insert target table
    if (tableRefs.length === 0) return [];
    const ref = tableRefs[0]!;
    const tableName = ref.schema ? `${ref.schema}.${ref.name}` : ref.name;
    const table = catalog.findTable(tableName);
    if (!table) return [];

    // Determine which column this position corresponds to
    const columns = table.columns;

    // If explicit column list provided, use that ordering
    if (insertColumns.length > 0) {
        if (position >= insertColumns.length) return [];
        const colName = insertColumns[position]!;
        const col = columns.find((c) => c.name.toLowerCase() === colName);
        if (!col) return [];

        return [{
            label: { label: `/* ${col.name} */`, description: col.data_type },
            kind: Kind.TypeParameter as languages.CompletionItemKind,
            detail: `${col.data_type}${col.is_nullable ? " · nullable" : ""}${col.default_value ? ` · default: ${col.default_value}` : ""}`,
            documentation: col.comment ?? `Column ${position + 1} of ${insertColumns.length}: ${col.name}`,
            insertText: "",
            range,
            sortText: "0_value_hint",
        }];
    }

    // No explicit column list → use table column order
    if (position >= columns.length) return [];
    const col = columns[position]!;

    return [{
        label: { label: `/* ${col.name} */`, description: col.data_type },
        kind: Kind.TypeParameter as languages.CompletionItemKind,
        detail: `${col.data_type}${col.is_nullable ? " · nullable" : ""}${col.default_value ? ` · default: ${col.default_value}` : ""}`,
        documentation: col.comment ?? `Column ${position + 1} of ${columns.length}: ${col.name}`,
        insertText: "",
        range,
        sortText: "0_value_hint",
    }];
}
