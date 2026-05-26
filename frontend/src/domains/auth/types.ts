/** Auth domain types. */

import type { UserRole, TokenResponse } from "@/shared/types";

export type { UserRole, TokenResponse };

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  display_name: string;
  password: string;
}

export interface UserResponse {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface SSOConfig {
  sso_enabled: boolean;
  sso_only_mode: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}
