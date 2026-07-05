import { Loader2, XCircle, type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  children?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon: Icon, children, className }: EmptyStateProps) {
  return (
    <div className={cn("flex h-full flex-col items-center justify-center gap-3 p-4 text-center", className)}>
      {Icon ? <Icon size={20} className="text-muted-foreground" aria-hidden="true" /> : null}
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {description ? <p className="text-xs text-muted-foreground/70">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

type LoadingStateProps = {
  label?: string;
  showLabel?: boolean;
  className?: string;
};

export function LoadingState({ label = "Loading", showLabel = false, className }: LoadingStateProps) {
  return (
    <div
      className={cn("flex h-full items-center justify-center gap-2 text-muted-foreground", className)}
      role="status"
      aria-label={label}
    >
      <Loader2 size={20} className="animate-spin" aria-hidden="true" />
      {showLabel ? <span className="text-xs font-medium">{label}</span> : null}
    </div>
  );
}

type ErrorStateProps = {
  message: ReactNode;
  title?: string;
  children?: ReactNode;
  className?: string;
};

export function ErrorState({ message, title, children, className }: ErrorStateProps) {
  return (
    <div className={cn("p-3", className)} role="alert">
      <div className="flex gap-2 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <XCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          {title ? <p className="font-medium">{title}</p> : null}
          <p className="break-words">{message}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
