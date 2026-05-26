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
      <div className="my-1 border-t" />
      <button
        type="button"
        onClick={onHostAsApi}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-popover-foreground hover:bg-accent"
      >
        Host as API
      </button>
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
    <button
      type="button"
      onClick={onUnhostApi}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-accent"
    >
      Unhost API
    </button>
  );
}
