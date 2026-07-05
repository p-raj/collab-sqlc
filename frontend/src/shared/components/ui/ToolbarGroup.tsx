import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";

type ToolbarGroupProps = HTMLAttributes<HTMLDivElement>;

export const ToolbarGroup = forwardRef<HTMLDivElement, ToolbarGroupProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center gap-1.5", className)} {...props} />
));

ToolbarGroup.displayName = "ToolbarGroup";
