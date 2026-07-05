import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type MenuContentProps = HTMLAttributes<HTMLDivElement>;

export const MenuContent = forwardRef<HTMLDivElement, MenuContentProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-md border bg-popover py-1 shadow-md", className)}
      {...props}
    />
  ),
);

MenuContent.displayName = "MenuContent";

type MenuItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  inset?: boolean;
  rightSlot?: ReactNode;
};

export const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(
  ({ className, inset = false, rightSlot, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-xs text-popover-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50",
        inset && "pl-7",
        className,
      )}
      {...props}
    >
      {children}
      {rightSlot ? <span className="ml-auto text-muted-foreground">{rightSlot}</span> : null}
    </button>
  ),
);

MenuItem.displayName = "MenuItem";

type MenuDividerProps = HTMLAttributes<HTMLDivElement>;

export function MenuDivider({ className, ...props }: MenuDividerProps) {
  return <div className={cn("my-1 border-t border-border", className)} {...props} />;
}
