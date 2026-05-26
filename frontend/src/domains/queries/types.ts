/** Saved queries domain types. */

export interface QueryFolder {
  id: string;
  name: string;
  parent_id: string | null;
  created_by: string;
  is_shared: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SavedQuery {
  id: string;
  title: string;
  sql: string;
  description: string | null;
  connection_id: string | null;
  folder_id: string | null;
  created_by: string;
  updated_by: string | null;
  is_shared: boolean;
  sort_order: number;
  api_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SavedQueryVersion {
  id: string;
  query_id: string;
  version_number: number;
  sql: string;
  title: string;
  description: string | null;
  edited_by: string | null;
  created_at: string;
}

export interface FavoriteEntry {
  query_id: string;
  created_at: string;
}
