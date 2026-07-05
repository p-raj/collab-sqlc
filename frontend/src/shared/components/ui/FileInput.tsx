import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";

type FileInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const FileInput = forwardRef<HTMLInputElement, FileInputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="file"
    className={cn(
      "w-full text-[0.75rem] text-muted-foreground file:mr-2 file:h-6 file:rounded file:border-0 file:bg-accent file:px-2 file:text-[0.75rem] file:text-foreground focus:outline-none focus:ring-1 focus:ring-focus",
      className,
    )}
    {...props}
  />
));

FileInput.displayName = "FileInput";
