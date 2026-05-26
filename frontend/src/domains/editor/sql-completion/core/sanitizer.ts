/**
 * SQL text sanitizer — strips strings, comments, and dollar-quotes,
 * replacing them with whitespace so that structural tokens remain
 * at correct offsets. Also locates the last statement boundary.
 */

type ScanState =
    | "default"
    | "single-quote"
    | "double-quote"
    | "backtick"
    | "bracket"
    | "line-comment"
    | "block-comment"
    | "dollar-quote";

export interface SanitizeResult {
    sanitized: string;
    statementStart: number;
    suppressed: boolean;
}

export function sanitizeSqlPrefix(text: string): SanitizeResult {
    let sanitized = "";
    let statementStart = 0;
    let state: ScanState = "default";
    let dollarQuoteTag: string | null = null;

    for (let i = 0; i < text.length; i++) {
        const char = text[i]!;
        const next = text[i + 1];

        switch (state) {
            case "default": {
                const dollarQuoteMatch =
                    char === "$" ? text.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/) : null;

                if (char === "-" && next === "-") {
                    sanitized += "  ";
                    state = "line-comment";
                    i++;
                    continue;
                }
                if (char === "/" && next === "*") {
                    sanitized += "  ";
                    state = "block-comment";
                    i++;
                    continue;
                }
                if (char === "'") {
                    sanitized += " ";
                    state = "single-quote";
                    continue;
                }
                if (char === '"') {
                    sanitized += char;
                    state = "double-quote";
                    continue;
                }
                if (char === "`") {
                    sanitized += " ";
                    state = "backtick";
                    continue;
                }
                if (char === "[") {
                    sanitized += " ";
                    state = "bracket";
                    continue;
                }
                if (dollarQuoteMatch) {
                    sanitized += " ".repeat(dollarQuoteMatch[0].length);
                    dollarQuoteTag = dollarQuoteMatch[0];
                    state = "dollar-quote";
                    i += dollarQuoteMatch[0].length - 1;
                    continue;
                }
                sanitized += char;
                if (char === ";") {
                    statementStart = i + 1;
                }
                continue;
            }

            case "single-quote": {
                if (char === "'" && next === "'") {
                    sanitized += "  ";
                    i++;
                    continue;
                }
                sanitized += char === "\n" ? "\n" : " ";
                if (char === "'") state = "default";
                continue;
            }

            case "double-quote": {
                if (char === '"' && next === '"') {
                    sanitized += '""';
                    i++;
                    continue;
                }
                sanitized += char;
                if (char === '"') state = "default";
                continue;
            }

            case "backtick": {
                sanitized += char === "\n" ? "\n" : " ";
                if (char === "`") state = "default";
                continue;
            }

            case "bracket": {
                sanitized += char === "\n" ? "\n" : " ";
                if (char === "]") state = "default";
                continue;
            }

            case "line-comment": {
                sanitized += char === "\n" ? "\n" : " ";
                if (char === "\n") state = "default";
                continue;
            }

            case "block-comment": {
                if (char === "*" && next === "/") {
                    sanitized += "  ";
                    state = "default";
                    i++;
                    continue;
                }
                sanitized += char === "\n" ? "\n" : " ";
                continue;
            }

            case "dollar-quote": {
                if (dollarQuoteTag && text.startsWith(dollarQuoteTag, i)) {
                    sanitized += " ".repeat(dollarQuoteTag.length);
                    state = "default";
                    i += dollarQuoteTag.length - 1;
                    dollarQuoteTag = null;
                    continue;
                }
                sanitized += char === "\n" ? "\n" : " ";
                continue;
            }
        }
    }

    return { sanitized, statementStart, suppressed: state !== "default" };
}
