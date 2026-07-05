import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";

type ToolbarProps = HTMLAttributes<HTMLDivElement>;

export const Toolbar = forwardRef<HTMLDivElement, ToolbarProps>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex h-toolbar shrink-0 items-center border-b border-border bg-background px-3",
      className,
    )}
    {...props}
  />
));

Toolbar.displayName = "Toolbar";
