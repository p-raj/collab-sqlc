import { type HTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const calloutVariants = cva("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", {
  variants: {
    tone: {
      info: "border-info/30 bg-info/10 text-info",
      success: "border-success/30 bg-success/10 text-success",
      warning: "border-warning/30 bg-warning/10 text-warning",
      danger: "border-destructive/30 bg-destructive/10 text-destructive",
      neutral: "border-border bg-muted/20 text-muted-foreground",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

const toneIcon: Record<NonNullable<VariantProps<typeof calloutVariants>["tone"]>, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  neutral: Info,
};

type CalloutProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof calloutVariants> & {
    title?: ReactNode;
    icon?: LucideIcon | null;
  };

export function Callout({
  tone = "neutral",
  title,
  icon,
  children,
  className,
  ...props
}: CalloutProps) {
  const Icon = icon === null ? null : (icon ?? toneIcon[tone ?? "neutral"]);

  return (
    <div className={cn(calloutVariants({ tone }), className)} {...props}>
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium text-foreground">{title}</p> : null}
        {children ? (
          <div className={cn(title && "mt-1", "text-xs text-muted-foreground")}>{children}</div>
        ) : null}
      </div>
    </div>
  );
}
