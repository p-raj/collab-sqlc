import { describe, expect, it } from "vitest";
import { createSqlCompletionProvider } from "./monaco-provider";

describe("createSqlCompletionProvider", () => {
    it("registers trigger characters including : for variable types", () => {
        const provider = createSqlCompletionProvider(() => []);

        expect(provider.triggerCharacters).toEqual([".", " ", "(", ",", "=", ":"]);
    });
});