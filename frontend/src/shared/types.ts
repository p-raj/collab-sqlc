/** Shared types used across the frontend. */

export type UserRole = "admin" | "editor" | "viewer";

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  requires_secret_key?: boolean;
}

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface ApiError {
  error: string;
  message: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}
