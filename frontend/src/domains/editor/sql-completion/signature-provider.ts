/**
 * Monaco SignatureHelpProvider for SQL functions.
 *
 * Shows parameter hints when typing inside function calls:
 *   count(|)  →  count(expression)
 *   string_agg(expr, |)  →  string_agg(expression, delimiter)
 */

import type { editor, languages, Position } from "monaco-editor";
import type { TableInfo } from "@/domains/schema/types";
import { createCatalog } from "./catalog/catalog";
import type { CatalogFunction } from "./catalog/types";
import type { DatabaseType } from "./catalog/dialect";
import { sanitizeSqlPrefix } from "./core/sanitizer";

export function createSqlSignatureHelpProvider(
    getTables: () => TableInfo[],
    getDbType?: () => DatabaseType | null,
): languages.SignatureHelpProvider {
    let cachedTables: TableInfo[] | null = null;
    let cachedDbType: DatabaseType | null = null;
    let cachedCatalog: ReturnType<typeof createCatalog> | null = null;

    return {
        signatureHelpTriggerCharacters: ["(", ","],
        signatureHelpRetriggerCharacters: [","],

        provideSignatureHelp(
            model: editor.ITextModel,
            position: Position,
        ): languages.ProviderResult<languages.SignatureHelpResult> {
            const fullText = model.getValue();
            const cursorOffset = model.getOffsetAt(position);
            const textBefore = fullText.slice(0, cursorOffset);

            const ctx = findFunctionContext(textBefore);
            if (!ctx) return undefined;

            const tables = getTables();
            const dbType = getDbType?.() ?? null;
            if (tables !== cachedTables || dbType !== cachedDbType) {
                cachedCatalog = createCatalog(tables, dbType);
                cachedTables = tables;
                cachedDbType = dbType;
            }

            const fn = cachedCatalog!.functions.find(
                (f) => f.name.toLowerCase() === ctx.functionName.toLowerCase(),
            );
            if (!fn) return undefined;

            const params = parseParams(fn);
            if (params.length === 0) return undefined;

            return {
                value: {
                    signatures: [
                        {
                            label: fn.signature,
                            documentation: `${fn.description} (${fn.category})`,
                            parameters: params,
                        },
                    ],
                    activeSignature: 0,
                    activeParameter: Math.min(ctx.argIndex, params.length - 1),
                },
                dispose() { },
            };
        },
    };
}

interface FunctionContext {
    functionName: string;
    argIndex: number;
}

function findFunctionContext(textBefore: string): FunctionContext | null {
    const { sanitized, suppressed } = sanitizeSqlPrefix(textBefore);
    if (suppressed) return null;

    // Walk backward from end to find unmatched '('
    let depth = 0;
    let argIndex = 0;

    for (let i = sanitized.length - 1; i >= 0; i--) {
        const ch = sanitized[i];
        if (ch === ")") { depth++; continue; }
        if (ch === "(") {
            if (depth > 0) { depth--; continue; }
            // Found unmatched '(' — extract function name before it
            const before = sanitized.slice(0, i).trimEnd();
            const nameMatch = before.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
            if (!nameMatch) return null;
            return { functionName: nameMatch[1]!, argIndex };
        }
        if (ch === "," && depth === 0) { argIndex++; }
    }

    return null;
}

function parseParams(fn: CatalogFunction): languages.ParameterInformation[] {
    // Extract param list from signature: "name(param1, param2, ...)" → ["param1", "param2", "..."]
    const match = fn.signature.match(/\(([^)]*)\)/);
    if (!match?.[1]) return [];

    return match[1].split(",").map((p) => ({
        label: p.trim(),
    }));
}
