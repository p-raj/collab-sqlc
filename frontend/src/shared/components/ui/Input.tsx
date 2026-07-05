import { forwardRef, type InputHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

const inputVariants = cva(
  "w-full rounded border border-input bg-transparent text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-focus disabled:cursor-not-allowed disabled:opacity-50",
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

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> &
  VariantProps<typeof inputVariants>;

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, size, ...props }, ref) => (
  <input ref={ref} className={cn(inputVariants({ size }), className)} {...props} />
));

Input.displayName = "Input";
