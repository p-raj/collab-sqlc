import type { QueryFolder } from "../types";

type FolderLookupEntry = Pick<QueryFolder, "id" | "name" | "parent_id">;

export function buildFolderLookup(folders: FolderLookupEntry[]): Map<string, FolderLookupEntry> {
  return new Map(folders.map((folder) => [folder.id, folder]));
}

export function buildFolderPath(
  folderId: string | null,
  folderById: Map<string, FolderLookupEntry>,
): string[] {
  const segments: string[] = [];
  const seen = new Set<string>();
  let currentFolderId = folderId;

  while (currentFolderId && !seen.has(currentFolderId)) {
    seen.add(currentFolderId);
    const folder = folderById.get(currentFolderId);
    if (!folder) {
      break;
    }
    segments.unshift(folder.name);
    currentFolderId = folder.parent_id;
  }

  return segments;
}

export function getFolderName(
  folderId: string | null,
  folderById: Map<string, FolderLookupEntry>,
): string | null {
  if (!folderId) {
    return null;
  }

  return folderById.get(folderId)?.name ?? null;
}
