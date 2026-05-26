import { create } from "zustand";
import type { QueryFolder, SavedQuery } from "../types";
import * as queriesApi from "../services/queries-api";

interface SavedQueriesState {
  folders: QueryFolder[];
  queries: SavedQuery[];
  favoriteIds: Set<string>;
  isLoading: boolean;
  error: string | null;

  loadAll: () => Promise<void>;
  createFolder: (name: string, parentId?: string | null) => Promise<QueryFolder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  toggleFolderShare: (id: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  saveQuery: (data: {
    title: string;
    sql: string;
    description?: string | null;
    connection_id?: string | null;
    folder_id?: string | null;
    is_shared?: boolean;
  }) => Promise<SavedQuery>;
  updateQuery: (
    id: string,
    data: Partial<Pick<SavedQuery, "title" | "sql" | "folder_id" | "description" | "is_shared">>,
  ) => Promise<void>;
  deleteQuery: (id: string) => Promise<void>;
  toggleFavorite: (queryId: string) => Promise<void>;
  forkQuery: (queryId: string) => Promise<SavedQuery>;
}

export const useSavedQueriesStore = create<SavedQueriesState>((set, get) => ({
  folders: [],
  queries: [],
  favoriteIds: new Set<string>(),
  isLoading: false,
  error: null,

  loadAll: async () => {
    if (get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      const [folders, queries, favorites] = await Promise.all([
        queriesApi.fetchFolders(),
        queriesApi.fetchSavedQueries(),
        queriesApi.fetchFavorites(),
      ]);
      set({
        folders,
        queries,
        favoriteIds: new Set(favorites.map((f) => f.query_id)),
        isLoading: false,
      });
    } catch {
      set({ isLoading: false, error: "Failed to load saved queries" });
    }
  },

  createFolder: async (name, parentId = null) => {
    const folder = await queriesApi.createFolder({ name, parent_id: parentId });
    set((s) => ({ folders: [...s.folders, folder] }));
    return folder;
  },

  renameFolder: async (id, name) => {
    const updated = await queriesApi.updateFolder(id, { name });
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? updated : f)),
    }));
  },

  toggleFolderShare: async (id) => {
    const folder = get().folders.find((f) => f.id === id);
    if (!folder) return;
    const updated = await queriesApi.updateFolder(id, { is_shared: !folder.is_shared });
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? updated : f)),
    }));
  },

  deleteFolder: async (id) => {
    await queriesApi.deleteFolder(id);
    set((s) => ({
      folders: s.folders.filter((f) => f.id !== id),
      queries: s.queries.map((q) => (q.folder_id === id ? { ...q, folder_id: null } : q)),
    }));
  },

  saveQuery: async (data) => {
    const query = await queriesApi.createSavedQuery(data);
    set((s) => ({ queries: [...s.queries, query] }));
    return query;
  },

  updateQuery: async (id, data) => {
    const updated = await queriesApi.updateSavedQuery(id, data);
    set((s) => ({
      queries: s.queries.map((q) => (q.id === id ? updated : q)),
    }));
  },

  deleteQuery: async (id) => {
    await queriesApi.deleteSavedQuery(id);
    set((s) => ({ queries: s.queries.filter((q) => q.id !== id) }));
  },

  toggleFavorite: async (queryId) => {
    const result = await queriesApi.toggleFavorite(queryId);
    set((s) => {
      const next = new Set(s.favoriteIds);
      if (result.favorited) next.add(queryId);
      else next.delete(queryId);
      return { favoriteIds: next };
    });
  },

  forkQuery: async (queryId) => {
    const forked = await queriesApi.forkQuery(queryId);
    set((s) => ({ queries: [...s.queries, forked] }));
    return forked;
  },
}));
