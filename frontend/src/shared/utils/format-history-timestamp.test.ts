import { describe, expect, it } from "vitest";
import { formatHistoryTimestamp } from "./format-history-timestamp";

describe("formatHistoryTimestamp", () => {
  const now = new Date(2026, 4, 5, 15, 30);

  it("labels timestamps from today", () => {
    expect(formatHistoryTimestamp(new Date(2026, 4, 5, 9, 15), now)).toContain("Today · ");
  });

  it("labels timestamps from yesterday", () => {
    expect(formatHistoryTimestamp(new Date(2026, 4, 4, 23, 45), now)).toContain("Yesterday · ");
  });

  it("shows month and day for older timestamps in the same year", () => {
    const formatted = formatHistoryTimestamp(new Date(2026, 1, 12, 8, 0), now);
    expect(formatted).not.toContain("Today");
    expect(formatted).not.toContain("Yesterday");
    expect(formatted).toContain("·");
  });

  it("shows the year for timestamps from a different year", () => {
    expect(formatHistoryTimestamp(new Date(2025, 11, 31, 20, 10), now)).toContain("2025");
  });
});
