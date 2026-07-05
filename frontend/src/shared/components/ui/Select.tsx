import { forwardRef, type SelectHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

const selectVariants = cva(
  "w-full rounded border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-focus disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        xs: "h-6 px-1.5 text-xs",
        sm: "h-7 px-2 text-xs",
        md: "h-8 px-2.5 text-sm",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  },
);

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> &
  VariantProps<typeof selectVariants>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ className, size, ...props }, ref) => (
  <select ref={ref} className={cn(selectVariants({ size }), className)} {...props} />
));

Select.displayName = "Select";
