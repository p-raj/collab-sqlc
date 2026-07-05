import { useCallback, useEffect, useReducer, useState } from "react";
import { RefreshCw, ChevronLeft, ChevronRight, UserPlus, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/domains/auth/hooks/use-auth-store";
import { Button } from "@/shared/components/ui/Button";
import { Callout } from "@/shared/components/ui/Callout";
import { Checkbox } from "@/shared/components/ui/Checkbox";
import { EmptyState, ErrorState, LoadingState } from "@/shared/components/ui/DataState";
import { Field, FieldLabel } from "@/shared/components/ui/Field";
import { IconButton } from "@/shared/components/ui/IconButton";
import { Input } from "@/shared/components/ui/Input";
import { Panel } from "@/shared/components/ui/Panel";
import { Select } from "@/shared/components/ui/Select";
import { TabButton, TabsRoot } from "@/shared/components/ui/Tabs";
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
    return <ErrorState message={error} className="p-0" />;
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden">
      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {users.length} user{users.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setShowInviteForm((p) => !p);
              setLastInviteUrl(null);
            }}
            leftIcon={<UserPlus size={12} />}
          >
            Invite User
          </Button>
          <Button onClick={loadData} loading={isLoading} leftIcon={<RefreshCw size={12} />}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Invite form */}
      {showInviteForm && (
        <Panel className="space-y-2 rounded p-3">
          <div className="flex items-end gap-2">
            <Field className="flex-1">
              <FieldLabel>Email</FieldLabel>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                size="md"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleInvite();
                }}
              />
            </Field>
            <Field>
              <FieldLabel>Role</FieldLabel>
              <Select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as UserRole)}
                size="md"
              >
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
                <option value="admin">admin</option>
              </Select>
            </Field>
            <Button
              onClick={() => void handleInvite()}
              variant="primary"
              size="md"
              loading={inviteLoading}
              disabled={!inviteEmail.trim()}
            >
              {inviteLoading ? "Sending..." : "Send Invite"}
            </Button>
          </div>
          {lastInviteUrl && (
            <Callout tone="success" icon={null} className="py-1.5">
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate text-xs text-success">{lastInviteUrl}</span>
                <IconButton
                  aria-label="Copy invite link"
                  onClick={() => copyInviteUrl(lastInviteUrl)}
                  icon={<Copy size={12} />}
                  title="Copy invite link"
                />
              </div>
            </Callout>
          )}
        </Panel>
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
                      <Button
                        onClick={() => void handleRevokeInvite(inv.id)}
                        variant="danger"
                        size="xs"
                        leftIcon={<X size={10} />}
                        title="Revoke invite"
                      >
                        Revoke
                      </Button>
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
                    <Select
                      value={user.role}
                      disabled={isSelf}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                      size="xs"
                    >
                      <option value="admin">admin</option>
                      <option value="editor">editor</option>
                      <option value="viewer">viewer</option>
                    </Select>
                  </td>
                  <td className="px-3 py-1.5">
                    {user.secret_key ? (
                      <Button
                        onClick={() => {
                          navigator.clipboard.writeText(user.secret_key!);
                          toast.success("Secret key copied");
                        }}
                        size="xs"
                        leftIcon={<Copy size={10} />}
                        className="font-mono"
                        title="Click to copy"
                      >
                        {user.secret_key}
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <Button
                      disabled={isSelf}
                      onClick={() => handleToggleActive(user.id, user.is_active)}
                      size="xs"
                      variant={user.is_active ? "secondary" : "danger"}
                    >
                      {user.is_active ? "Active" : "Inactive"}
                    </Button>
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
                  <LoadingState label="Loading users" />
                </td>
              </tr>
            )}
            {users.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-8">
                  <EmptyState title="No users found" />
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
    return <LoadingState label="Loading settings" className="py-12" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold">GitHub SSO</h3>
        <Panel className="space-y-4 rounded p-4">
          {/* Enable SSO */}
          <label className="flex items-center gap-3">
            <Checkbox checked={ssoEnabled} onChange={(e) => setSsoEnabled(e.target.checked)} />
            <div>
              <span className="text-sm font-medium">Enable GitHub SSO</span>
              <p className="text-xs text-muted-foreground">Allow users to sign in with GitHub</p>
            </div>
          </label>

          {/* SSO-only mode */}
          <label className="flex items-center gap-3">
            <Checkbox
              checked={ssoOnlyMode}
              onChange={(e) => setSsoOnlyMode(e.target.checked)}
              disabled={!ssoEnabled}
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

          <Button onClick={() => void handleSave()} variant="primary" size="md" loading={saving}>
            {saving ? "Saving..." : "Save SSO Settings"}
          </Button>
        </Panel>
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
      <TabsRoot className="mb-4 gap-4 border-b">
        <TabButton
          onClick={() => setActiveTab("audit")}
          active={activeTab === "audit"}
          className="h-auto pb-2 text-sm"
        >
          Audit Logs
        </TabButton>
        <TabButton
          onClick={() => setActiveTab("users")}
          active={activeTab === "users"}
          className="h-auto pb-2 text-sm"
        >
          Users
        </TabButton>
        <TabButton
          onClick={() => setActiveTab("settings")}
          active={activeTab === "settings"}
          className="h-auto pb-2 text-sm"
        >
          Settings
        </TabButton>
      </TabsRoot>

      {activeTab === "settings" && <SettingsTab />}
      {activeTab === "users" && <UsersTab />}

      {activeTab === "audit" && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {state.total} total log{state.total !== 1 ? "s" : ""}
            </span>
            <Button onClick={loadLogs} loading={state.isLoading} leftIcon={<RefreshCw size={12} />}>
              Refresh
            </Button>
          </div>

          {/* Filters */}
          <div className="mb-3 flex flex-wrap gap-2">
            <Input
              type="text"
              placeholder="Filter by action..."
              value={state.filters.action ?? ""}
              onChange={(e) =>
                dispatch({ type: "SET_FILTER", key: "action", value: e.target.value })
              }
              size="sm"
            />
            <Input
              type="text"
              placeholder="Filter by resource..."
              value={state.filters.resource_type ?? ""}
              onChange={(e) =>
                dispatch({ type: "SET_FILTER", key: "resource_type", value: e.target.value })
              }
              size="sm"
            />
          </div>

          {/* Error */}
          {state.error && <ErrorState message={state.error} className="mb-3 p-0" />}

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
                    <td colSpan={6} className="px-3 py-8">
                      <EmptyState title="No audit logs found" />
                    </td>
                  </tr>
                )}
                {state.isLoading && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center">
                      <LoadingState label="Loading audit logs" />
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
                <IconButton
                  aria-label="Previous page"
                  onClick={() => dispatch({ type: "PREV_PAGE" })}
                  disabled={(state.filters.offset ?? 0) === 0}
                  icon={<ChevronLeft size={14} />}
                />
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <IconButton
                  aria-label="Next page"
                  onClick={() => dispatch({ type: "NEXT_PAGE" })}
                  disabled={!state.hasMore}
                  icon={<ChevronRight size={14} />}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
