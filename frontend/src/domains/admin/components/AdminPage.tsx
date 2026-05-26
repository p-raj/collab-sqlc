import { useCallback, useEffect, useReducer, useState } from "react";
import { RefreshCw, Loader2, ChevronLeft, ChevronRight, UserPlus, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/domains/auth/hooks/use-auth-store";
import {
  fetchAuditLogs,
  fetchUsers,
  updateUser,
  createInvite,
  fetchInvites,
  revokeInvite,
  fetchSSOSettings,
  updateSSOSettings,
} from "../services/admin-api";
import type { AuditLog, AuditLogFilters, AdminUser } from "../types";
import type { PendingInvite } from "../services/admin-api";
import type { UserRole } from "@/shared/types";

// ── Audit Log State ─────────────────────────────────────────

interface AdminState {
  logs: AuditLog[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  filters: AuditLogFilters;
}

type AdminAction =
  | { type: "SET_LOADING" }
  | { type: "SET_LOGS"; logs: AuditLog[]; total: number; hasMore: boolean }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_FILTER"; key: keyof AuditLogFilters; value: string }
  | { type: "NEXT_PAGE" }
  | { type: "PREV_PAGE" };

const PAGE_SIZE = 50;

function reducer(state: AdminState, action: AdminAction): AdminState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, isLoading: true, error: null };
    case "SET_LOGS":
      return {
        ...state,
        logs: action.logs,
        total: action.total,
        hasMore: action.hasMore,
        isLoading: false,
      };
    case "SET_ERROR":
      return { ...state, error: action.error, isLoading: false };
    case "SET_FILTER":
      return {
        ...state,
        filters: { ...state.filters, [action.key]: action.value || undefined, offset: 0 },
      };
    case "NEXT_PAGE":
      return {
        ...state,
        filters: {
          ...state.filters,
          offset: (state.filters.offset ?? 0) + PAGE_SIZE,
        },
      };
    case "PREV_PAGE":
      return {
        ...state,
        filters: {
          ...state.filters,
          offset: Math.max(0, (state.filters.offset ?? 0) - PAGE_SIZE),
        },
      };
  }
}

// ── Users Tab ───────────────────────────────────────────────

function UsersTab() {
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("viewer");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [usersData, invitesData] = await Promise.all([fetchUsers(), fetchInvites()]);
      setUsers(usersData.items);
      setInvites(invitesData.items);
    } catch {
      setError("Failed to load users");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRoleChange = useCallback(async (userId: string, role: UserRole) => {
    try {
      const updated = await updateUser(userId, { role });
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      toast.success("User role updated");
    } catch {
      toast.error("Failed to update user role");
    }
  }, []);

  const handleToggleActive = useCallback(async (userId: string, isActive: boolean) => {
    try {
      const updated = await updateUser(userId, { is_active: !isActive });
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      toast.success(isActive ? "User deactivated" : "User activated");
    } catch {
      toast.error("Failed to update user status");
    }
  }, []);

  const handleInvite = useCallback(async () => {
    if (!inviteEmail.trim()) return;
    setInviteLoading(true);
    try {
      const result = await createInvite(inviteEmail.trim(), inviteRole);
      setLastInviteUrl(result.invite_url);
      setInvites((prev) => [
        {
          id: result.id,
          email: result.email,
          role: result.role,
          invited_by: currentUser?.id ?? null,
          expires_at: result.expires_at,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setInviteEmail("");
      toast.success(`Invite sent to ${result.email}`);
    } catch {
      toast.error("Failed to create invite");
    } finally {
      setInviteLoading(false);
    }
  }, [inviteEmail, inviteRole, currentUser]);

  const handleRevokeInvite = useCallback(async (inviteId: string) => {
    try {
      await revokeInvite(inviteId);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      toast.success("Invite revoked");
    } catch {
      toast.error("Failed to revoke invite");
    }
  }, []);

  const copyInviteUrl = useCallback((url: string) => {
    navigator.clipboard.writeText(url).then(() => toast.success("Invite link copied"));
  }, []);

  if (error) {
    return (
      <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden">
      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {users.length} user{users.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowInviteForm((p) => !p);
              setLastInviteUrl(null);
            }}
            className="inline-flex h-7 items-center gap-1 rounded border border-input px-2.5 text-xs hover:bg-accent"
          >
            <UserPlus size={12} />
            Invite User
          </button>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="inline-flex h-7 items-center gap-1 rounded border border-input px-2.5 text-xs hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Invite form */}
      {showInviteForm && (
        <div className="rounded border border-border bg-muted/30 p-3 space-y-2">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium">Email</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                className="flex h-8 w-full rounded border border-input bg-transparent px-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleInvite();
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as UserRole)}
                className="flex h-8 rounded border border-input bg-transparent px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <button
              onClick={() => void handleInvite()}
              disabled={inviteLoading || !inviteEmail.trim()}
              className="inline-flex h-8 items-center rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {inviteLoading ? "Sending..." : "Send Invite"}
            </button>
          </div>
          {lastInviteUrl && (
            <div className="flex items-center gap-2 rounded border border-green-500/30 bg-green-500/10 px-2 py-1.5">
              <span className="flex-1 truncate text-xs text-green-700 dark:text-green-400">
                {lastInviteUrl}
              </span>
              <button
                onClick={() => copyInviteUrl(lastInviteUrl)}
                className="shrink-0 rounded p-1 hover:bg-green-500/20"
                title="Copy invite link"
              >
                <Copy size={12} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Pending Invites ({invites.length})
          </span>
          <div className="rounded border border-border">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Email</th>
                  <th className="px-3 py-1.5 text-left font-medium">Role</th>
                  <th className="px-3 py-1.5 text-left font-medium">Expires</th>
                  <th className="px-3 py-1.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.id} className="border-b last:border-0 hover:bg-accent/30">
                    <td className="px-3 py-1.5">{inv.email}</td>
                    <td className="px-3 py-1.5">{inv.role}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        onClick={() => void handleRevokeInvite(inv.id)}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-destructive hover:bg-destructive/10"
                        title="Revoke invite"
                      >
                        <X size={10} />
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="flex-1 overflow-auto rounded border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 border-b bg-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Email</th>
              <th className="px-3 py-2 text-left font-medium">Role</th>
              <th className="px-3 py-2 text-left font-medium">Secret Key</th>
              <th className="px-3 py-2 text-left font-medium">Active</th>
              <th className="px-3 py-2 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === currentUser?.id;
              return (
                <tr key={user.id} className="border-b last:border-0 hover:bg-accent/30">
                  <td className="px-3 py-1.5">{user.display_name}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{user.email}</td>
                  <td className="px-3 py-1.5">
                    <select
                      value={user.role}
                      disabled={isSelf}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                      className="h-6 rounded border border-input bg-transparent px-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                    >
                      <option value="admin">admin</option>
                      <option value="editor">editor</option>
                      <option value="viewer">viewer</option>
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    {user.secret_key ? (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(user.secret_key!);
                          toast.success("Secret key copied");
                        }}
                        className="inline-flex items-center gap-1 rounded border border-input px-1.5 py-0.5 font-mono text-xs text-muted-foreground hover:bg-accent"
                        title="Click to copy"
                      >
                        {user.secret_key}
                        <Copy size={10} />
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <button
                      disabled={isSelf}
                      onClick={() => handleToggleActive(user.id, user.is_active)}
                      className={`inline-flex h-6 items-center rounded border px-2 text-xs disabled:opacity-50 ${user.is_active
                          ? "border-green-500/30 bg-green-500/10 text-green-600"
                          : "border-red-500/30 bg-red-500/10 text-red-600"
                        }`}
                    >
                      {user.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center">
                  <Loader2 size={16} className="mx-auto animate-spin text-muted-foreground" />
                </td>
              </tr>
            )}
            {users.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Settings Tab ─────────────────────────────────────────────

function SettingsTab() {
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoOnlyMode, setSsoOnlyMode] = useState(false);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchSSOSettings();
      setSsoEnabled(data.sso_enabled);
      setSsoOnlyMode(data.sso_only_mode);
    } catch {
      toast.error("Failed to load SSO settings");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateSSOSettings({
        sso_enabled: ssoEnabled,
        sso_only_mode: ssoOnlyMode,
      });
      toast.success("SSO settings saved");
    } catch {
      toast.error("Failed to save SSO settings");
    } finally {
      setSaving(false);
    }
  }, [ssoEnabled, ssoOnlyMode]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold">GitHub SSO</h3>
        <div className="space-y-4 rounded border border-border p-4">
          {/* Enable SSO */}
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={ssoEnabled}
              onChange={(e) => setSsoEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <div>
              <span className="text-sm font-medium">Enable GitHub SSO</span>
              <p className="text-xs text-muted-foreground">Allow users to sign in with GitHub</p>
            </div>
          </label>

          {/* SSO-only mode */}
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={ssoOnlyMode}
              onChange={(e) => setSsoOnlyMode(e.target.checked)}
              disabled={!ssoEnabled}
              className="h-4 w-4 rounded border-input disabled:opacity-50"
            />
            <div>
              <span className="text-sm font-medium">SSO-only mode</span>
              <p className="text-xs text-muted-foreground">
                Hide password login (admins can still use password as fallback)
              </p>
            </div>
          </label>

          <p className="text-xs text-muted-foreground">
            GitHub Client ID and Secret are configured via environment variables.
          </p>

          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex h-8 items-center rounded bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save SSO Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Admin Page ─────────────────────────────────────────

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"audit" | "users" | "settings">("audit");
  const [state, dispatch] = useReducer(reducer, {
    logs: [],
    total: 0,
    hasMore: false,
    isLoading: false,
    error: null,
    filters: { limit: PAGE_SIZE, offset: 0 },
  });

  const loadLogs = useCallback(async () => {
    dispatch({ type: "SET_LOADING" });
    try {
      const data = await fetchAuditLogs(state.filters);
      dispatch({
        type: "SET_LOGS",
        logs: data.items,
        total: data.total,
        hasMore: data.has_more,
      });
    } catch {
      dispatch({ type: "SET_ERROR", error: "Failed to load audit logs" });
    }
  }, [state.filters]);

  useEffect(() => {
    if (activeTab === "audit") loadLogs();
  }, [loadLogs, activeTab]);

  const currentPage = Math.floor((state.filters.offset ?? 0) / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(state.total / PAGE_SIZE);

  return (
    <div className="flex min-h-[60vh] flex-col overflow-hidden">
      {/* Tabs */}
      <div className="mb-4 flex items-center gap-4 border-b">
        <button
          onClick={() => setActiveTab("audit")}
          className={`pb-2 text-sm font-medium ${activeTab === "audit"
              ? "border-b-2 border-foreground text-foreground"
              : "text-muted-foreground hover:text-foreground"
            }`}
        >
          Audit Logs
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`pb-2 text-sm font-medium ${activeTab === "users"
              ? "border-b-2 border-foreground text-foreground"
              : "text-muted-foreground hover:text-foreground"
            }`}
        >
          Users
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`pb-2 text-sm font-medium ${activeTab === "settings"
              ? "border-b-2 border-foreground text-foreground"
              : "text-muted-foreground hover:text-foreground"
            }`}
        >
          Settings
        </button>
      </div>

      {activeTab === "settings" && <SettingsTab />}
      {activeTab === "users" && <UsersTab />}

      {activeTab === "audit" && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {state.total} total log{state.total !== 1 ? "s" : ""}
            </span>
            <button
              onClick={loadLogs}
              disabled={state.isLoading}
              className="inline-flex h-7 items-center gap-1 rounded border border-input px-2.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              <RefreshCw size={12} className={state.isLoading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {/* Filters */}
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="Filter by action..."
              value={state.filters.action ?? ""}
              onChange={(e) =>
                dispatch({ type: "SET_FILTER", key: "action", value: e.target.value })
              }
              className="h-7 rounded border border-input bg-transparent px-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              type="text"
              placeholder="Filter by resource..."
              value={state.filters.resource_type ?? ""}
              onChange={(e) =>
                dispatch({ type: "SET_FILTER", key: "resource_type", value: e.target.value })
              }
              className="h-7 rounded border border-input bg-transparent px-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Error */}
          {state.error && (
            <div className="mb-3 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </div>
          )}

          {/* Table */}
          <div className="flex-1 overflow-auto rounded border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 border-b bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Time</th>
                  <th className="px-3 py-2 text-left font-medium">User</th>
                  <th className="px-3 py-2 text-left font-medium">Action</th>
                  <th className="px-3 py-2 text-left font-medium">Resource</th>
                  <th className="px-3 py-2 text-left font-medium">Details</th>
                  <th className="px-3 py-2 text-left font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {state.logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-accent/30">
                    <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5">{log.user_email}</td>
                    <td className="px-3 py-1.5 font-medium">{log.action}</td>
                    <td className="px-3 py-1.5">
                      {log.resource_type}
                      {log.resource_id && (
                        <span className="ml-1 text-muted-foreground">
                          ({log.resource_id.slice(0, 8)})
                        </span>
                      )}
                    </td>
                    <td className="max-w-xs truncate px-3 py-1.5 text-muted-foreground">
                      {log.details ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{log.ip_address ?? "—"}</td>
                  </tr>
                ))}
                {state.logs.length === 0 && !state.isLoading && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      No audit logs found
                    </td>
                  </tr>
                )}
                {state.isLoading && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center">
                      <Loader2 size={16} className="mx-auto animate-spin text-muted-foreground" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {state.total > 0 && (
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {state.total} total log{state.total !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => dispatch({ type: "PREV_PAGE" })}
                  disabled={(state.filters.offset ?? 0) === 0}
                  className="rounded p-1 hover:bg-accent disabled:opacity-30"
                >
                  <ChevronLeft size={14} />
                </button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => dispatch({ type: "NEXT_PAGE" })}
                  disabled={!state.hasMore}
                  className="rounded p-1 hover:bg-accent disabled:opacity-30"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
