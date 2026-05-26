export interface SqlSelection {
    startOffset: number;
    endOffset: number;
}

function clampOffset(text: string, offset: number): number {
    return Math.max(0, Math.min(offset, text.length));
}

function trimStatement(sql: string): string | undefined {
    const trimmed = sql.trim();
    return trimmed ? trimmed : undefined;
}

function findAnchorOffset(text: string, cursorOffset: number): number | undefined {
    const before = clampOffset(text, cursorOffset) - 1;
    if (before >= 0) {
        const charBefore = text[before];
        if (charBefore && !/\s/.test(charBefore) && charBefore !== ";") {
            return before;
        }
    }

    const after = clampOffset(text, cursorOffset);
    if (after < text.length) {
        const charAfter = text[after];
        if (charAfter && !/\s/.test(charAfter) && charAfter !== ";") {
            return after;
        }
    }

    for (let i = after; i < text.length; i++) {
        const nextChar = text[i];
        if (!nextChar || /\s/.test(nextChar) || nextChar === ";") continue;
        return i;
    }

    for (let i = before; i >= 0; i--) {
        const prevChar = text[i];
        if (!prevChar || /\s/.test(prevChar) || prevChar === ";") continue;
        return i;
    }

    return undefined;
}

export function extractActiveSql(
    text: string,
    cursorOffset: number,
    selection?: SqlSelection | null,
): string | undefined {
    if (selection && selection.startOffset !== selection.endOffset) {
        const start = clampOffset(text, Math.min(selection.startOffset, selection.endOffset));
        const end = clampOffset(text, Math.max(selection.startOffset, selection.endOffset));
        return trimStatement(text.slice(start, end));
    }

    if (!text.includes(";")) {
        return trimStatement(text);
    }

    const anchorOffset = findAnchorOffset(text, cursorOffset);
    if (anchorOffset === undefined) {
        return trimStatement(text);
    }

    const start = text.lastIndexOf(";", anchorOffset) + 1;
    const endDelimiter = text.indexOf(";", anchorOffset);
    const end = endDelimiter === -1 ? text.length : endDelimiter + 1;
    return trimStatement(text.slice(start, end));
}