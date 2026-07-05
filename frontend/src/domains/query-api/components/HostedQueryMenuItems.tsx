import { MenuDivider, MenuItem } from "@/shared/components/ui/Menu";

interface HostedQueryMenuItemsProps {
  savedQueryId: string | null | undefined;
  isHosted: boolean;
  onHostAsApi?: () => void;
  onUnhostApi?: () => void;
}

export function HostedQuerySaveMenuItems({
  savedQueryId,
  isHosted,
  onHostAsApi,
}: HostedQueryMenuItemsProps) {
  if (!savedQueryId || isHosted || !onHostAsApi) {
    return null;
  }

  return (
    <>
      <MenuDivider />
      <MenuItem onClick={onHostAsApi}>
        Host as API
      </MenuItem>
    </>
  );
}

export function HostedQueryMoreMenuItems({
  savedQueryId,
  isHosted,
  onUnhostApi,
}: HostedQueryMenuItemsProps) {
  if (!savedQueryId || !isHosted || !onUnhostApi) {
    return null;
  }

  return (
    <MenuItem onClick={onUnhostApi} className="text-destructive">
      Unhost API
    </MenuItem>
  );
}
