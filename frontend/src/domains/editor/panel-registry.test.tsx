import { describe, expect, it } from "vitest";
import { WORKSPACE_PANELS } from "./panel-registry";

describe("workspace panel registry", () => {
  it("keeps the registered panel ids stable", () => {
    expect(WORKSPACE_PANELS.map((panel) => panel.id)).toEqual([
      "search",
      "schema",
      "queries",
      "history",
      "api-queries",
      "api-logs",
      "assistant",
      "connections",
    ]);
  });
});
