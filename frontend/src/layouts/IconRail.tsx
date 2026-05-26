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
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center w-8 h-8 rounded text-muted-foreground hover:bg-accent hover:text-foreground ${isActive ? "bg-accent text-foreground" : ""
        }`}
    >
      {icon}
    </button>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      className="flex items-center justify-center w-8 h-8 rounded text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
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
      <button
        onClick={onLogout}
        title={user ? `${user.display_name} (${user.role}) — Sign out` : "Sign out"}
        className="flex items-center justify-center w-8 h-8 rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {user ? (
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-accent text-xs font-medium">
            {user.display_name.charAt(0).toUpperCase()}
          </span>
        ) : (
          <LogOut size={16} />
        )}
      </button>
    </div>
  );
}
