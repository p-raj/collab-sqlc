import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type SectionHeaderProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function SectionHeader({ title, description, actions, className, ...props }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)} {...props}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-medium text-foreground">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
