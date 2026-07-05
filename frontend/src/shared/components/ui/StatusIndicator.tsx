import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";

type StatusTone = "neutral" | "success" | "danger";

const toneClasses: Record<StatusTone, string> = {
  neutral: "text-muted-foreground",
  success: "text-foreground",
  danger: "text-destructive",
};

type StatusIndicatorProps = {
  label: string;
  icon?: LucideIcon;
  loading?: boolean;
  tone?: StatusTone;
  className?: string;
};

export function StatusIndicator({
  label,
  icon: Icon,
  loading = false,
  tone = "neutral",
  className,
}: StatusIndicatorProps) {
  const IconComponent = loading ? Loader2 : Icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {IconComponent ? (
        <IconComponent size={12} className={cn(loading && "animate-spin")} aria-hidden="true" />
      ) : null}
      {label}
    </span>
  );
}
