import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { CodeBlock } from "./CodeBlock";

type CommandCardProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  title: ReactNode;
  command: ReactNode;
};

export const CommandCard = forwardRef<HTMLButtonElement, CommandCardProps>(
  ({ title, command, className, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "block w-full rounded-md border bg-card p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus",
        className,
      )}
      {...props}
    >
      <div className="text-sm font-medium">{title}</div>
      <CodeBlock className="mt-2 whitespace-pre-wrap border-0 bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground">
        {command}
      </CodeBlock>
    </button>
  ),
);

CommandCard.displayName = "CommandCard";
