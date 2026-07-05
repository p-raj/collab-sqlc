import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

type TabStripRootProps = HTMLAttributes<HTMLDivElement>;

export function TabStripRoot({ className, ...props }: TabStripRootProps) {
  return (
    <div
      className={cn("flex h-9 items-center gap-px overflow-x-auto border-b bg-card px-1", className)}
      {...props}
    />
  );
}

type TabStripGroupProps = HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
};

export function TabStripGroup({ active = false, className, ...props }: TabStripGroupProps) {
  return (
    <div
      className={cn(
        "group flex h-7 items-center rounded transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50",
        className,
      )}
      {...props}
    />
  );
}

const tabStripTabVariants = cva(
  "flex h-7 min-w-0 items-center gap-1.5 rounded-l px-2.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus",
  {
    variants: {
      active: {
        true: "text-accent-foreground",
        false: "text-muted-foreground",
      },
      hasAction: {
        true: "pr-1",
        false: "rounded-r",
      },
    },
    defaultVariants: {
      active: false,
      hasAction: false,
    },
  },
);

type TabStripTabProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof tabStripTabVariants> & {
    indicator?: ReactNode;
  };

export const TabStripTab = forwardRef<HTMLButtonElement, TabStripTabProps>(
  ({ active, hasAction, indicator, className, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      role="tab"
      aria-selected={Boolean(active)}
      className={cn(tabStripTabVariants({ active, hasAction }), className)}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {indicator}
    </button>
  ),
);

TabStripTab.displayName = "TabStripTab";

type TabStripActionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: ReactNode;
  "aria-label": string;
};

export const TabStripAction = forwardRef<HTMLButtonElement, TabStripActionProps>(
  ({ icon, className, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "flex h-7 w-6 shrink-0 items-center justify-center rounded-r text-muted-foreground opacity-0 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus group-hover:opacity-100 focus-visible:opacity-100",
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  ),
);

TabStripAction.displayName = "TabStripAction";
