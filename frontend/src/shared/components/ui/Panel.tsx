import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

const panelVariants = cva("bg-card text-card-foreground", {
  variants: {
    variant: {
      flat: "",
      bordered: "border border-border",
      raised: "border border-border shadow-sm",
    },
    padding: {
      none: "",
      sm: "p-2",
      md: "p-3",
    },
  },
  defaultVariants: {
    variant: "bordered",
    padding: "none",
  },
});

type PanelProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof panelVariants>;

export const Panel = forwardRef<HTMLDivElement, PanelProps>(({ className, variant, padding, ...props }, ref) => (
  <div ref={ref} className={cn(panelVariants({ variant, padding }), className)} {...props} />
));

Panel.displayName = "Panel";
