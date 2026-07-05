import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1 rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "border border-input bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        xs: "h-6 px-2 text-xs",
        sm: "h-7 px-2.5 text-xs",
        md: "h-8 px-3 text-sm",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "sm",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, loading = false, leftIcon, rightIcon, children, disabled, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : leftIcon}
      {children}
      {rightIcon}
    </button>
  ),
);

Button.displayName = "Button";
