import { api } from "@/shared/services/api-client";
import type {
  AuditLogFilters,
  AuditLogListResponse,
  AdminUser,
  AdminUserListResponse,
  UpdateUserPayload,
} from "../types";
import type { UserRole } from "@/shared/types";

export interface InviteResponse {
  id: string;
  email: string;
  role: UserRole;
  invite_url: string;
  expires_at: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: UserRole;
  invited_by: string | null;
  expires_at: string;
  created_at: string;
}

export interface InviteListResponse {
  items: PendingInvite[];
}

export async function fetchAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogListResponse> {
  const searchParams: Record<string, string> = {};
  if (filters.user_id) searchParams["user_id"] = filters.user_id;
  if (filters.action) searchParams["action"] = filters.action;
  if (filters.resource_type) searchParams["resource_type"] = filters.resource_type;
  if (filters.since) searchParams["since"] = filters.since;
  if (filters.until) searchParams["until"] = filters.until;
  if (filters.limit) searchParams["limit"] = String(filters.limit);
  if (filters.offset) searchParams["offset"] = String(filters.offset);

  return api.get("admin/audit-logs", { searchParams }).json<AuditLogListResponse>();
}

export async function fetchUsers(): Promise<AdminUserListResponse> {
  return api.get("admin/users").json<AdminUserListResponse>();
}

export async function updateUser(userId: string, data: UpdateUserPayload): Promise<AdminUser> {
  return api.patch(`admin/users/${userId}`, { json: data }).json<AdminUser>();
}

export async function createInvite(email: string, role: UserRole): Promise<InviteResponse> {
  return api.post("admin/users/invites", { json: { email, role } }).json<InviteResponse>();
}

export async function fetchInvites(): Promise<InviteListResponse> {
  return api.get("admin/users/invites").json<InviteListResponse>();
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await api.delete(`admin/users/invites/${inviteId}`);
}

export interface SSOSettings {
  sso_enabled: boolean;
  sso_only_mode: boolean;
}

export interface UpdateSSOSettings {
  sso_enabled?: boolean;
  sso_only_mode?: boolean;
}

export async function fetchSSOSettings(): Promise<SSOSettings> {
  return api.get("admin/settings/sso").json<SSOSettings>();
}

export async function updateSSOSettings(data: UpdateSSOSettings): Promise<SSOSettings> {
  return api.put("admin/settings/sso", { json: data }).json<SSOSettings>();
}
