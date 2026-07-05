import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      "h-3 w-3 rounded border-input text-primary focus:outline-none focus:ring-1 focus:ring-focus disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));

Checkbox.displayName = "Checkbox";
