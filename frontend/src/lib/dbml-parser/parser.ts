/**
 * DBML text → structured JSON parser.
 *
 * Handles: Table definitions (fields, settings, indexes), Enum definitions,
 * Ref definitions (short form, long form, inline), composite foreign keys,
 * cross-schema refs, triple-quoted notes, and Project blocks.
 * Supports both quoted ("identifier") and unquoted identifiers per DBML spec.
 *
 * Grammar reference: github.com/daihuynh/lark-dbml (Lark grammar)
 */

import type {
  DbmlField,
  DbmlIndex,
  DbmlTable,
  DbmlEnum,
  DbmlRef,
  DbmlSchema,
} from "./types";

// ── String-aware utilities ──────────────────────────────────────────────────

/** Count consecutive backslashes ending at position i-1 */
function countTrailingBackslashes(text: string, i: number): number {
  let count = 0;
  let j = i - 1;
  while (j >= 0 && text[j] === "\\") {
    count++;
    j--;
  }
  return count;
}

/**
 * Strip comments while respecting string boundaries.
 * Walks char-by-char, tracking whether we're inside a string literal
 * (single-quoted, double-quoted, triple-quoted, or backtick).
 */
function stripComments(text: string): string {
  const out: string[] = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    // Triple-quoted strings: '''...'''
    if (text[i] === "'" && text[i + 1] === "'" && text[i + 2] === "'") {
      const start = i;
      i += 3;
      while (i < len) {
        if (text[i] === "'" && text[i + 1] === "'" && text[i + 2] === "'"
            && countTrailingBackslashes(text, i) % 2 === 0) {
          i += 3;
          break;
        }
        i++;
      }
      out.push(text.slice(start, i));
      continue;
    }

    // Single/double-quoted strings or backtick expressions
    if (text[i] === "'" || text[i] === '"' || text[i] === "`") {
      const quote = text[i]!;
      const start = i;
      i++;
      while (i < len) {
        if (text[i] === quote && countTrailingBackslashes(text, i) % 2 === 0) {
          i++;
          break;
        }
        i++;
      }
      out.push(text.slice(start, i));
      continue;
    }

    // Line comment: //
    if (text[i] === "/" && text[i + 1] === "/") {
      while (i < len && text[i] !== "\n") i++;
      continue;
    }

    // Block comment: /* ... */
    if (text[i] === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < len) {
        if (text[i] === "*" && text[i + 1] === "/") {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }

    out.push(text[i]!);
    i++;
  }

  return out.join("");
}

/**
 * Extract a brace-delimited block, respecting strings (including triple-quoted)
 * and backtick expressions. Handles escaped backslashes correctly.
 */
function extractBraceBlock(text: string, startIndex: number): { body: string; endIndex: number } {
  let depth = 0;
  let bodyStart = -1;
  let i = startIndex;
  const len = text.length;

  while (i < len) {
    const ch = text[i]!;

    // Triple-quoted string
    if (ch === "'" && text[i + 1] === "'" && text[i + 2] === "'") {
      i += 3;
      while (i < len) {
        if (text[i] === "'" && text[i + 1] === "'" && text[i + 2] === "'"
            && countTrailingBackslashes(text, i) % 2 === 0) {
          i += 3;
          break;
        }
        i++;
      }
      continue;
    }

    // Single/double-quoted string or backtick expression
    if (ch === "'" || ch === '"' || ch === "`") {
      i++;
      while (i < len) {
        if (text[i] === ch && countTrailingBackslashes(text, i) % 2 === 0) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (ch === "{") {
      if (depth === 0) bodyStart = i + 1;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return { body: text.slice(bodyStart, i).trim(), endIndex: i };
      }
    }

    i++;
  }

  return { body: text.slice(bodyStart).trim(), endIndex: text.length };
}

/** Unwrap a matched identifier from quoted/unquoted capture groups */
function unwrap(quoted: string | undefined, unquoted: string | undefined): string {
  return (quoted || unquoted || "").replace(/^"|"$/g, "");
}

/** Parse a possibly-quoted, possibly-schema-qualified identifier */
function parseQualifiedName(raw: string): { schema?: string; name: string } {
  const m = raw.match(/^(?:"([^"]+)"|(\w+))\.(?:"([^"]+)"|(\w+))$/);
  if (m) {
    return { schema: unwrap(m[1], m[2]), name: unwrap(m[3], m[4]) };
  }
  return { name: raw.replace(/^"|"$/g, "") };
}

/**
 * Parse a ref endpoint: schema.table.col, table.col, or table.(col1, col2).
 */
function parseRefEndpoint(raw: string): { table: string; columns: string[] } {
  const trimmed = raw.trim();

  // Composite: table.(col1, col2)
  const compositeMatch = trimmed.match(
    /^((?:"[^"]+"|[\w]+)(?:\.(?:"[^"]+"|[\w]+))?)\.\(([^)]+)\)$/
  );
  if (compositeMatch) {
    const tablePart = compositeMatch[1]!.replace(/^"|"$/g, "").replace(/"\."/g, ".");
    const cols = compositeMatch[2]!.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    return { table: tablePart, columns: cols };
  }

  // Single column: split on dots handling quoted segments
  const segments: string[] = [];
  const segRe = /(?:"([^"]+)"|(\w+))/g;
  let segMatch;
  while ((segMatch = segRe.exec(trimmed)) !== null) {
    segments.push(unwrap(segMatch[1], segMatch[2]));
  }

  if (segments.length >= 3) {
    return { table: `${segments[0]}.${segments[1]}`, columns: [segments[2]!] };
  }
  if (segments.length === 2) {
    return { table: segments[0]!, columns: [segments[1]!] };
  }
  return { table: segments[0] || "", columns: [] };
}

// ── Quote-aware splitting ───────────────────────────────────────────────────

/**
 * Split a string on a delimiter, respecting single-quoted, double-quoted,
 * and backtick-delimited segments. Handles all three string types the grammar
 * defines (STRING, MULTILINE_STRING, FUNC_EXP).
 */
function splitRespectingQuotes(text: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let i = 0;
  const len = text.length;

  while (i < len) {
    // Triple-quote
    if (text[i] === "'" && text[i + 1] === "'" && text[i + 2] === "'") {
      current += "'''";
      i += 3;
      while (i < len) {
        if (text[i] === "'" && text[i + 1] === "'" && text[i + 2] === "'"
            && countTrailingBackslashes(text, i) % 2 === 0) {
          current += "'''";
          i += 3;
          break;
        }
        current += text[i];
        i++;
      }
      continue;
    }

    // Single/double/backtick quoted
    if (text[i] === "'" || text[i] === '"' || text[i] === "`") {
      const q = text[i]!;
      current += q;
      i++;
      while (i < len) {
        current += text[i];
        if (text[i] === q && countTrailingBackslashes(text, i) % 2 === 0) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (text[i] === delimiter) {
      parts.push(current);
      current = "";
      i++;
      continue;
    }

    current += text[i];
    i++;
  }

  parts.push(current);
  return parts;
}

/**
 * Extract the content of a [...] settings block from a line.
 * Finds the *outermost* balanced brackets, respecting quoted strings inside.
 * Returns the inner content and the index range, or null if no brackets found.
 */
function extractBracketBlock(text: string): { inner: string; start: number; end: number } | null {
  const openIdx = text.indexOf("[");
  if (openIdx === -1) return null;

  let depth = 0;
  let i = openIdx;
  const len = text.length;

  while (i < len) {
    if (text[i] === "'" || text[i] === '"' || text[i] === "`") {
      const q = text[i]!;
      i++;
      while (i < len) {
        if (text[i] === q && countTrailingBackslashes(text, i) % 2 === 0) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (text[i] === "[") depth++;
    else if (text[i] === "]") {
      depth--;
      if (depth === 0) {
        return { inner: text.slice(openIdx + 1, i), start: openIdx, end: i };
      }
    }
    i++;
  }

  return null;
}

/**
 * Extract a quoted string value (single, double, or triple-quoted).
 * Returns the unquoted content.
 */
function extractQuotedString(text: string): string {
  const trimmed = text.trim();

  // Triple-quoted
  if (trimmed.startsWith("'''")) {
    const end = trimmed.indexOf("'''", 3);
    if (end !== -1) return trimmed.slice(3, end).trim();
    return trimmed.slice(3).trim();
  }

  // Single or double-quoted
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

// ── Field settings parsing ──────────────────────────────────────────────────

function parseFieldSettings(settingsStr: string): Partial<DbmlField> & { refs?: string[] } {
  const result: Partial<DbmlField> & { refs?: string[] } = {};
  const parts = splitRespectingQuotes(settingsStr, ",").map((s) => s.trim());

  for (const part of parts) {
    if (!part) continue;
    const lower = part.toLowerCase();
    if (lower === "pk" || lower === "primary key") {
      result.pk = true;
    } else if (lower === "unique") {
      result.unique = true;
    } else if (lower === "not null") {
      result.not_null = true;
    } else if (lower === "null") {
      result.not_null = false;
    } else if (lower === "increment") {
      result.increment = true;
    } else if (lower.startsWith("default:")) {
      result.default = extractQuotedString(part.slice("default:".length).trim());
    } else if (lower.startsWith("note:")) {
      result.note = extractQuotedString(part.slice("note:".length).trim());
    } else if (lower.startsWith("ref:")) {
      const refVal = part.slice("ref:".length).trim();
      // Collect all inline refs (a field can have multiple)
      if (!result.refs) result.refs = [];
      result.refs.push(refVal);
      // Keep first ref on the field for backward compat
      if (!result.ref) result.ref = refVal;
    }
  }

  return result;
}

// ── Field parsing ───────────────────────────────────────────────────────────

function parseField(line: string): { field: DbmlField; extraRefs?: string[] } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("//") || /^Note\s/i.test(trimmed) || trimmed.startsWith("~")) return null;

  // Extract settings block using bracket-aware extraction
  const bracket = extractBracketBlock(trimmed);
  const withoutSettings = bracket
    ? trimmed.slice(0, bracket.start).trim()
    : trimmed;

  // Field format: "name" type  or  name "quoted type"  or  name type
  const fieldMatch = withoutSettings.match(/^(?:"([^"]+)"|(\w+))\s+(.+)$/);
  if (!fieldMatch) return null;

  const name = unwrap(fieldMatch[1], fieldMatch[2]);
  const type = fieldMatch[3]!.trim().replace(/^"|"$/g, "");

  const field: DbmlField = { name, type };
  let extraRefs: string[] | undefined;

  if (bracket) {
    const { refs, ...settings } = parseFieldSettings(bracket.inner);
    Object.assign(field, settings);
    if (refs && refs.length > 1) {
      extraRefs = refs.slice(1);
    }
  }

  return { field, extraRefs };
}

// ── Index parsing ───────────────────────────────────────────────────────────

function parseIndexSettings(settingsStr: string): Partial<DbmlIndex> {
  const result: Partial<DbmlIndex> = {};
  const parts = splitRespectingQuotes(settingsStr, ",").map((s) => s.trim());
  for (const part of parts) {
    if (!part) continue;
    const lower = part.toLowerCase();
    if (lower === "unique") result.unique = true;
    else if (lower === "pk" || lower === "primary key") result.pk = true;
    else if (lower.startsWith("name:"))
      result.name = extractQuotedString(part.slice("name:".length).trim());
    else if (lower.startsWith("type:"))
      result.type = part.slice("type:".length).trim();
    else if (lower.startsWith("note:"))
      result.note = extractQuotedString(part.slice("note:".length).trim());
  }
  return result;
}

function parseIndexes(body: string): DbmlIndex[] {
  const indexes: DbmlIndex[] = [];
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (line.startsWith("//")) continue;
    const cleanLine = line.replace(/\/\/.*$/, "").trim();
    if (!cleanLine) continue;

    // Composite: (col1, col2, `expr`) [settings]
    const parenMatch = cleanLine.match(/^\(((?:[^)`]*|`[^`]*`)*)\)/);
    // Single: `expr` [settings]  or  "col" [settings]  or  col [settings]
    const singleMatch = cleanLine.match(/^(?:`([^`]+)`|"([^"]+)"|(\w+))/);

    let columns: string[] = [];
    let rest = "";

    if (parenMatch) {
      columns = splitRespectingQuotes(parenMatch[1]!, ",")
        .map((c) => c.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
      rest = cleanLine.slice(parenMatch[0].length).trim();
    } else if (singleMatch) {
      columns = [singleMatch[1] || unwrap(singleMatch[2], singleMatch[3])];
      rest = cleanLine.slice(singleMatch[0].length).trim();
    }

    if (columns.length === 0) continue;

    const index: DbmlIndex = { columns };
    const bracket = extractBracketBlock(rest);
    if (bracket) Object.assign(index, parseIndexSettings(bracket.inner));

    indexes.push(index);
  }

  return indexes;
}

// ── Table parsing ───────────────────────────────────────────────────────────

function parseTable(header: string, body: string): DbmlTable {
  // Strip table settings [...] from header before parsing name/alias
  const headerClean = header.replace(/^Table\s+/i, "").replace(/\s*\[.*\]\s*$/, "").trim();
  const aliasParts = headerClean.split(/\s+as\s+/i);
  const fullName = aliasParts[0]!.trim();
  const alias = aliasParts[1]?.trim().replace(/^"|"$/g, "");

  const { schema, name } = parseQualifiedName(fullName);

  const table: DbmlTable = { name, fields: [] };
  if (schema) table.schema = schema;
  if (alias) table.alias = alias;

  // Split body into fields section and indexes section
  const indexBlockMatch = body.match(/indexes\s*\{/i);
  let fieldsBody = body;
  let indexesBody: string | null = null;

  if (indexBlockMatch) {
    fieldsBody = body.slice(0, indexBlockMatch.index!);
    const idxStart = indexBlockMatch.index! + indexBlockMatch[0].length;
    const { body: idxBody } = extractBraceBlock("{" + body.slice(idxStart), 0);
    indexesBody = idxBody;
  }

  // Strip checks block (parsed but not exposed — matches grammar)
  const checksBlockMatch = fieldsBody.match(/checks\s*\{/i);
  if (checksBlockMatch) {
    const beforeChecks = fieldsBody.slice(0, checksBlockMatch.index!);
    const { endIndex } = extractBraceBlock(fieldsBody, checksBlockMatch.index!);
    fieldsBody = beforeChecks + fieldsBody.slice(endIndex + 1);
  }

  // Parse table-level Note (supports single, double, and triple-quoted)
  const noteRe = /^\s*Note\s*(?::\s*)?('''[\s\S]*?'''|'[^']*'|"[^"]*")/im;
  const noteMatch = body.match(noteRe);
  if (noteMatch) {
    table.note = extractQuotedString(noteMatch[1]!);
  }

  // Parse fields — collect inline refs separately
  const inlineRefs: Array<{ tableName: string; fieldName: string; ref: string }> = [];
  const tableKey = schema ? `${schema}.${name}` : name;

  const lines = fieldsBody.split("\n");
  for (const line of lines) {
    const parsed = parseField(line);
    if (!parsed) continue;
    table.fields.push(parsed.field);

    // Collect extra inline refs (when a field has multiple ref: entries)
    if (parsed.extraRefs) {
      for (const ref of parsed.extraRefs) {
        inlineRefs.push({ tableName: tableKey, fieldName: parsed.field.name, ref });
      }
    }
  }

  if (indexesBody) {
    table.indexes = parseIndexes(indexesBody);
  }

  // Stash inline refs on the table for the caller to extract
  (table as DbmlTable & { _inlineRefs?: typeof inlineRefs })._inlineRefs = inlineRefs;

  return table;
}

// ── Enum parsing ────────────────────────────────────────────────────────────

function parseEnum(header: string, body: string): DbmlEnum {
  const rawName = header.replace(/^Enum\s+/i, "").trim();
  const { schema, name } = parseQualifiedName(rawName);
  const values: DbmlEnum["values"] = [];

  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith("//")) continue;
    const valueName = line.split(/\s*\[/)[0]!.trim().replace(/^"|"$/g, "");
    if (!valueName) continue;

    const entry: { name: string; note?: string } = { name: valueName };
    const bracket = extractBracketBlock(line);
    if (bracket) {
      const parts = splitRespectingQuotes(bracket.inner, ",").map((s) => s.trim());
      for (const part of parts) {
        if (part.toLowerCase().startsWith("note:")) {
          entry.note = extractQuotedString(part.slice("note:".length).trim());
        }
      }
    }
    values.push(entry);
  }

  const result: DbmlEnum = { name, values };
  if (schema) result.schema = schema;
  return result;
}

// ── Ref parsing ─────────────────────────────────────────────────────────────

function parseRefSettings(settingsStr: string): { on_delete?: string; on_update?: string } {
  const result: { on_delete?: string; on_update?: string } = {};
  const parts = splitRespectingQuotes(settingsStr, ",").map((s) => s.trim());
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower.startsWith("delete:")) {
      result.on_delete = part.slice("delete:".length).trim();
    } else if (lower.startsWith("update:")) {
      result.on_update = part.slice("update:".length).trim();
    }
  }
  return result;
}

function parseRefBody(body: string, refName?: string): DbmlRef | null {
  const m = body.match(
    /^((?:(?:"[^"]+"|[\w]+)\.)*(?:"[^"]+"|[\w]+)(?:\([^)]+\))?)\s*([><-]|<>)\s*((?:(?:"[^"]+"|[\w]+)\.)*(?:"[^"]+"|[\w]+)(?:\([^)]+\))?)/
  );
  if (!m) return null;

  const from = parseRefEndpoint(m[1]!);
  const to = parseRefEndpoint(m[3]!);
  const type = m[2]! as DbmlRef["type"];

  const ref: DbmlRef = { from, to, type };
  if (refName) ref.name = refName;

  // Extract settings from the remainder after the endpoints
  const remainder = body.slice(m[0].length).trim();
  const bracket = extractBracketBlock(remainder);
  if (bracket) {
    const settings = parseRefSettings(bracket.inner);
    if (settings.on_delete) ref.on_delete = settings.on_delete;
    if (settings.on_update) ref.on_update = settings.on_update;
  }

  return ref;
}

function parseRefs(text: string): DbmlRef[] {
  const refs: DbmlRef[] = [];

  // Match top-level Ref statements only (not inline ref: inside field settings).
  // Anchored to line start or preceded by whitespace to avoid matching inside tables.
  const refRe = /(?:^|\n)\s*Ref(?:\s+(?:"([^"]+)"|(\w+)))?\s*([:{])/gi;
  let match;

  while ((match = refRe.exec(text)) !== null) {
    const refName = unwrap(match[1], match[2]) || undefined;
    const delim = match[3];

    if (delim === ":") {
      // Short form: Ref name: endpoint > endpoint [settings]
      const lineEnd = text.indexOf("\n", match.index + match[0].length);
      const line = text.slice(match.index + match[0].length, lineEnd === -1 ? undefined : lineEnd).trim();
      const parsed = parseRefBody(line, refName);
      if (parsed) refs.push(parsed);
    } else {
      // Long form: Ref name { ... }
      const { body } = extractBraceBlock(text, match.index + match[0].length - 1);
      const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const parsed = parseRefBody(line, refName);
        if (parsed) refs.push(parsed);
      }
    }
  }

  return refs;
}

// ── Main entry point ────────────────────────────────────────────────────────

export function parseDbml(text: string): DbmlSchema {
  const cleaned = stripComments(text);
  const schema: DbmlSchema = { tables: {}, enums: {}, refs: [] };

  // Project block
  const projectMatch = cleaned.match(/Project\s+(?:"[^"]*"|\w*)\s*\{/i);
  if (projectMatch) {
    const { body } = extractBraceBlock(cleaned, projectMatch.index!);
    const dbTypeMatch = body.match(/database_type:\s*(?:'''[\s\S]*?'''|'[^']*'|"[^"]*")/i);
    if (dbTypeMatch) {
      schema.database_type = extractQuotedString(
        dbTypeMatch[0].slice(dbTypeMatch[0].indexOf(":") + 1).trim()
      );
    }
  }

  // Tables — allow optional [settings] between name/alias and opening brace
  const tableRe = /Table\s+(?:"[^"]*"\.)?(?:"[^"]*"|[\w.]+)(?:\s+as\s+(?:"[^"]*"|\w+))?(?:\s*\[[^\]]*\])?\s*\{/gi;
  let tableMatch;
  while ((tableMatch = tableRe.exec(cleaned)) !== null) {
    // Guard: skip TablePartial (Table is a prefix of TablePartial)
    const afterTable = cleaned.slice(tableMatch.index + 5);
    if (/^Partial\s/i.test(afterTable)) continue;

    const header = cleaned
      .slice(tableMatch.index, tableMatch.index + tableMatch[0].length - 1)
      .trim();
    const { body } = extractBraceBlock(cleaned, tableMatch.index);
    const table = parseTable(header, body);
    const key = table.schema ? `${table.schema}.${table.name}` : table.name;
    schema.tables[key] = table;

    // Extract inline refs from fields
    for (const field of table.fields) {
      if (field.ref) {
        const refMatch = field.ref.match(/([><-]|<>)\s*(.*)/);
        if (refMatch) {
          schema.refs.push({
            from: { table: key, columns: [field.name] },
            to: parseRefEndpoint(refMatch[2]!),
            type: refMatch[1] as DbmlRef["type"],
          });
        }
      }
    }

    // Extract extra inline refs (multiple ref: on one field)
    const extra = (table as DbmlTable & { _inlineRefs?: Array<{ tableName: string; fieldName: string; ref: string }> })._inlineRefs;
    if (extra) {
      for (const r of extra) {
        const refMatch = r.ref.match(/([><-]|<>)\s*(.*)/);
        if (refMatch) {
          schema.refs.push({
            from: { table: r.tableName, columns: [r.fieldName] },
            to: parseRefEndpoint(refMatch[2]!),
            type: refMatch[1] as DbmlRef["type"],
          });
        }
      }
      delete (table as DbmlTable & { _inlineRefs?: unknown })._inlineRefs;
    }
  }

  // Enums — support schema prefix
  const enumRe = /Enum\s+(?:(?:"[^"]*"|[\w]+)\.)?(?:"[^"]*"|[\w.]+)\s*\{/gi;
  let enumMatch;
  while ((enumMatch = enumRe.exec(cleaned)) !== null) {
    const header = cleaned
      .slice(enumMatch.index, enumMatch.index + enumMatch[0].length - 1)
      .trim();
    const { body } = extractBraceBlock(cleaned, enumMatch.index);
    const dbmlEnum = parseEnum(header, body);
    const key = dbmlEnum.schema ? `${dbmlEnum.schema}.${dbmlEnum.name}` : dbmlEnum.name;
    schema.enums[key] = dbmlEnum;
  }

  // Top-level Refs (short and long form)
  schema.refs.push(...parseRefs(cleaned));

  return schema;
}
