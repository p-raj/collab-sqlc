import {
  Cable,
  Settings,
  LogOut,
  Keyboard,
  Moon,
  Sun,
} from "lucide-react";
import {
  WORKSPACE_PANELS,
  getWorkspacePanel,
} from "@/domains/editor/panel-registry";
import { IconButton } from "@/shared/components/ui/IconButton";
import { useTheme } from "@/shared/contexts/theme-context";
import type { User } from "@/shared/types";
import type { PanelId } from "@/domains/editor/panel-registry";

export type { PanelId } from "@/domains/editor/panel-registry";

interface IconRailProps {
  activePanelId: PanelId | null;
  onPanelToggle: (panelId: PanelId) => void;
  user: User | null;
  onLogout: () => void;
  onAdmin: () => void;
  isAdminActive: boolean;
  onShowShortcuts: () => void;
}

interface RailButtonProps {
  icon: React.ReactNode;
  title: string;
  isActive: boolean;
  onClick: () => void;
}

function RailButton({ icon, title, isActive, onClick }: RailButtonProps) {
  return (
    <IconButton
      aria-label={title}
      onClick={onClick}
      title={title}
      icon={icon}
      size="md"
      className={isActive ? "bg-accent text-foreground" : ""}
    />
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <IconButton
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      icon={isDark ? <Sun size={16} /> : <Moon size={16} />}
      size="md"
    />
  );
}

export function IconRail({
  activePanelId,
  onPanelToggle,
  user,
  onLogout,
  onAdmin,
  isAdminActive,
  onShowShortcuts,
}: IconRailProps) {
  return (
    <div className="flex flex-col items-center w-10 bg-card border-r py-2 gap-1">
      {WORKSPACE_PANELS.filter((panel) => panel.id !== "connections").map((panel) => {
        const Icon = panel.icon;
        return (
          <RailButton
            key={panel.id}
            icon={<Icon size={16} />}
            title={panel.title}
            isActive={activePanelId === panel.id}
            onClick={() => onPanelToggle(panel.id)}
          />
        );
      })}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Keyboard shortcuts */}
      <RailButton
        icon={<Keyboard size={16} />}
        title="Keyboard shortcuts"
        isActive={false}
        onClick={onShowShortcuts}
      />

      {/* Theme toggle */}
      <ThemeToggle />

      {/* Connections */}
      <RailButton
        icon={<Cable size={16} />}
        title={getWorkspacePanel("connections").title}
        isActive={activePanelId === "connections"}
        onClick={() => onPanelToggle("connections")}
      />

      {/* Admin */}
      {user?.role === "admin" && (
        <RailButton
          icon={<Settings size={16} />}
          title="Admin settings"
          isActive={isAdminActive}
          onClick={onAdmin}
        />
      )}

      {/* User avatar / logout */}
      <IconButton
        aria-label={user ? `${user.display_name} (${user.role}) — Sign out` : "Sign out"}
        onClick={onLogout}
        title={user ? `${user.display_name} (${user.role}) — Sign out` : "Sign out"}
        icon={user ? (
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-accent text-xs font-medium">
            {user.display_name.charAt(0).toUpperCase()}
          </span>
        ) : (
          <LogOut size={16} />
        )}
        size="md"
      />
    </div>
  );
}
