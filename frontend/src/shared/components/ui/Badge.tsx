import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

const badgeVariants = cva(
  "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[0.75rem] font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-muted-foreground",
        info: "bg-info/10 text-info",
        success: "bg-success/10 text-success",
        warning: "bg-warning/10 text-warning",
        danger: "bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
