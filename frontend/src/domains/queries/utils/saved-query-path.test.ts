import { describe, expect, it } from "vitest";
import { buildFolderLookup, buildFolderPath, getFolderName } from "./saved-query-path";

describe("saved-query-path", () => {
  it("builds a nested folder path from the leaf folder id", () => {
    const folderById = buildFolderLookup([
      { id: "root", name: "Team", parent_id: null },
      { id: "child", name: "API", parent_id: "root" },
      { id: "leaf", name: "Members", parent_id: "child" },
    ]);

    expect(buildFolderPath("leaf", folderById)).toEqual(["Team", "API", "Members"]);
  });

  it("returns the direct folder name for tab display", () => {
    const folderById = buildFolderLookup([
      { id: "folder-1", name: "Customer APIs", parent_id: null },
    ]);

    expect(getFolderName("folder-1", folderById)).toBe("Customer APIs");
    expect(getFolderName(null, folderById)).toBeNull();
  });
});
