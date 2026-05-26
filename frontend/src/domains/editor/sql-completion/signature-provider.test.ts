import { describe, expect, it } from "vitest";
import { createSqlSignatureHelpProvider } from "./signature-provider";
import type { TableInfo } from "@/domains/schema/types";

const EMPTY_TABLES: TableInfo[] = [];
const provider = createSqlSignatureHelpProvider(() => EMPTY_TABLES);

function getHelp(sql: string, cursor?: number) {
    const offset = cursor ?? sql.length;
    const lines = sql.slice(0, offset).split("\n");
    const lineNumber = lines.length;
    const column = lines[lines.length - 1]!.length + 1;

    const model = {
        getValue: () => sql,
        getOffsetAt: () => offset,
    } as never;

    const position = { lineNumber, column } as never;
    return provider.provideSignatureHelp(model, position, {} as never, {} as never);
}

function activeParam(sql: string, cursor?: number): number | undefined {
    const result = getHelp(sql, cursor);
    if (!result || !("value" in result)) return undefined;
    return result.value.activeParameter;
}

function signatureLabel(sql: string, cursor?: number): string | undefined {
    const result = getHelp(sql, cursor);
    if (!result || !("value" in result)) return undefined;
    return result.value.signatures[0]?.label;
}

describe("SignatureHelpProvider", () => {
    it("returns signature for count(", () => {
        expect(signatureLabel("SELECT count(")).toBe("count(expression)");
    });

    it("returns signature for string_agg(", () => {
        expect(signatureLabel("SELECT string_agg(")).toBe("string_agg(expression, delimiter)");
    });

    it("returns activeParameter 0 for first arg", () => {
        expect(activeParam("SELECT count(")).toBe(0);
    });

    it("returns activeParameter 0 for first arg with text", () => {
        expect(activeParam("SELECT string_agg(col")).toBe(0);
    });

    it("returns activeParameter 1 after first comma", () => {
        expect(activeParam("SELECT string_agg(col, ")).toBe(1);
    });

    it("returns activeParameter 2 after second comma", () => {
        expect(activeParam("SELECT make_timestamp(2024, 1, ")).toBe(2);
    });

    it("returns undefined when not inside function parens", () => {
        expect(signatureLabel("SELECT ")).toBeUndefined();
    });

    it("returns undefined for unknown function", () => {
        expect(signatureLabel("SELECT my_custom_func(")).toBeUndefined();
    });

    it("returns undefined inside a string", () => {
        expect(signatureLabel("SELECT count('hello")).toBeUndefined();
    });

    it("handles nested function calls", () => {
        // Inside coalesce(count(|)) — innermost is count
        expect(signatureLabel("SELECT coalesce(count(")).toBe("count(expression)");
    });

    it("handles nested function — outer after inner closes", () => {
        // coalesce(count(*), |) — now in coalesce's second arg
        expect(signatureLabel("SELECT coalesce(count(*), ")).toBe("coalesce(val1, val2, ...)");
        expect(activeParam("SELECT coalesce(count(*), ")).toBe(1);
    });

    it("is case-insensitive for function names", () => {
        expect(signatureLabel("SELECT COUNT(")).toBe("count(expression)");
        expect(signatureLabel("SELECT Count(")).toBe("count(expression)");
    });

    it("returns parameters for date_trunc", () => {
        const result = getHelp("SELECT date_trunc(");
        if (result && "value" in result) {
            expect(result.value.signatures[0]?.parameters).toHaveLength(2);
            expect(result.value.signatures[0]?.parameters[0]?.label).toBe("field");
            expect(result.value.signatures[0]?.parameters[1]?.label).toBe("source");
        }
    });

    it("works with WHERE clause context", () => {
        expect(signatureLabel("SELECT * FROM t WHERE length(")).toBe("length(string)");
    });

    it("clamps activeParameter to last param for variadic-like functions", () => {
        // coalesce has 3 params in our catalog: val1, val2, ...
        // Even with 5 commas, clamp to last param index
        expect(activeParam("SELECT coalesce(a, b, c, d, e, ")).toBe(2);
    });
});
