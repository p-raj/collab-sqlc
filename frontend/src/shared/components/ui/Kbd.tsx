import { type HTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";

type KbdProps = HTMLAttributes<HTMLElement>;

export function Kbd({ className, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-[20px] items-center justify-center rounded border bg-muted px-1.5 font-mono text-[0.75rem] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
