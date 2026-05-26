/** Admin domain types. */

import type { UserRole } from "@/shared/types";

export interface AuditLog {
  id: string;
  user_id: string;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogListResponse {
  items: AuditLog[];
  total: number;
  has_more: boolean;
}

export interface AuditLogFilters {
  user_id?: string;
  action?: string;
  resource_type?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  secret_key: string | null;
}

export interface AdminUserListResponse {
  items: AdminUser[];
}

export interface UpdateUserPayload {
  role?: UserRole;
  is_active?: boolean;
}
