import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

const iconButtonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        secondary: "border border-input bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        danger: "text-destructive hover:bg-destructive/10",
      },
      size: {
        xs: "h-6 w-6",
        sm: "h-7 w-7",
        md: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "xs",
    },
  },
);

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> &
  VariantProps<typeof iconButtonVariants> & {
    icon: ReactNode;
    "aria-label": string;
  };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, icon, ...props }, ref) => (
    <button ref={ref} className={cn(iconButtonVariants({ variant, size }), className)} {...props}>
      {icon}
    </button>
  ),
);

IconButton.displayName = "IconButton";
