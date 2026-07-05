import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

const textareaVariants = cva(
  "w-full rounded border border-input bg-transparent text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-focus disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        sm: "px-2 py-1 text-xs",
        md: "px-2.5 py-1.5 text-sm",
      },
      mono: {
        true: "font-mono",
        false: "",
      },
    },
    defaultVariants: {
      size: "sm",
      mono: false,
    },
  },
);

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> &
  VariantProps<typeof textareaVariants>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, size, mono, ...props }, ref) => (
    <textarea ref={ref} className={cn(textareaVariants({ size, mono }), className)} {...props} />
  ),
);

Textarea.displayName = "Textarea";
