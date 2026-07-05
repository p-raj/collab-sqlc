import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type ObjectListItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  indicator?: ReactNode;
  meta?: ReactNode;
};

export const ObjectListItem = forwardRef<HTMLButtonElement, ObjectListItemProps>(
  ({ active = false, indicator, meta, className, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left text-xs transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus",
        active && "bg-accent",
        className,
      )}
      {...props}
    >
      {indicator}
      <div className="min-w-0 flex-1 truncate">{children}</div>
      {meta}
    </button>
  ),
);

ObjectListItem.displayName = "ObjectListItem";
