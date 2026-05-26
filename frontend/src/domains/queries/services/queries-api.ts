import { api } from "@/shared/services/api-client";
import type { FavoriteEntry, QueryFolder, SavedQuery, SavedQueryVersion } from "../types";

// ── Folders ─────────────────────────────────────────────────

export async function fetchFolders(): Promise<QueryFolder[]> {
  const res = await api.get("folders").json<{ items: QueryFolder[] }>();
  return res.items;
}

export async function createFolder(data: {
  name: string;
  parent_id?: string | null;
  is_shared?: boolean;
}): Promise<QueryFolder> {
  return api.post("folders", { json: data }).json<QueryFolder>();
}

export async function updateFolder(
  id: string,
  data: Partial<Pick<QueryFolder, "name" | "parent_id" | "is_shared" | "sort_order">>,
): Promise<QueryFolder> {
  return api.patch(`folders/${id}`, { json: data }).json<QueryFolder>();
}

export async function deleteFolder(id: string): Promise<void> {
  await api.delete(`folders/${id}`);
}

// ── Saved Queries ───────────────────────────────────────────

export async function fetchSavedQueries(folderId?: string | null): Promise<SavedQuery[]> {
  const searchParams = folderId ? { folder_id: folderId } : undefined;
  const res = await api.get("saved-queries", { searchParams }).json<{ items: SavedQuery[] }>();
  return res.items;
}

export async function createSavedQuery(data: {
  title: string;
  sql: string;
  description?: string | null;
  connection_id?: string | null;
  folder_id?: string | null;
  is_shared?: boolean;
}): Promise<SavedQuery> {
  return api.post("saved-queries", { json: data }).json<SavedQuery>();
}

export async function updateSavedQuery(
  id: string,
  data: Partial<
    Pick<
      SavedQuery,
      "title" | "sql" | "description" | "connection_id" | "folder_id" | "is_shared" | "sort_order"
    >
  >,
): Promise<SavedQuery> {
  return api.patch(`saved-queries/${id}`, { json: data }).json<SavedQuery>();
}

export async function deleteSavedQuery(id: string): Promise<void> {
  await api.delete(`saved-queries/${id}`);
}

// ── Versions ────────────────────────────────────────────────

export async function fetchVersions(queryId: string): Promise<SavedQueryVersion[]> {
  const res = await api
    .get(`saved-queries/${queryId}/versions`)
    .json<{ items: SavedQueryVersion[] }>();
  return res.items;
}

export async function restoreVersion(queryId: string, versionId: string): Promise<SavedQuery> {
  return api.post(`saved-queries/${queryId}/versions/${versionId}/restore`).json<SavedQuery>();
}

// ── Favorites ───────────────────────────────────────────────

export async function toggleFavorite(queryId: string): Promise<{ favorited: boolean }> {
  return api.post(`saved-queries/${queryId}/favorite`).json<{ favorited: boolean }>();
}

export async function removeFavorite(queryId: string): Promise<void> {
  await api.delete(`saved-queries/${queryId}/favorite`);
}

export async function fetchFavorites(): Promise<FavoriteEntry[]> {
  const res = await api.get("saved-queries/favorites").json<{ items: FavoriteEntry[] }>();
  return res.items;
}

// ── Fork / Duplicate ────────────────────────────────────────

export async function forkQuery(queryId: string): Promise<SavedQuery> {
  return api.post(`saved-queries/${queryId}/fork`).json<SavedQuery>();
}
