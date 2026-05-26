/** Export utilities for query results. */
import type { QueryResult } from "../types";

export function resultsToCsv(result: QueryResult): string {
  const escape = (val: unknown): string => {
    const str = val == null ? "" : String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = result.columns.map(escape).join(",");
  const rows = result.rows.map((row) => row.map(escape).join(","));
  return [header, ...rows].join("\n");
}

export function resultsToJson(result: QueryResult): string {
  const objects = result.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    result.columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
  return JSON.stringify(objects, null, 2);
}

export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
