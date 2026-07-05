import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type CodeBlockProps = HTMLAttributes<HTMLPreElement> & {
  children: ReactNode;
};

export function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  return (
    <pre
      className={cn(
        "overflow-auto rounded border border-input bg-muted/20 p-3 font-mono text-xs text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </pre>
  );
}

type InlineCodeProps = HTMLAttributes<HTMLElement>;

export function InlineCode({ className, ...props }: InlineCodeProps) {
  return (
    <code className={cn("rounded bg-muted px-1 font-mono text-[0.75rem]", className)} {...props} />
  );
}
