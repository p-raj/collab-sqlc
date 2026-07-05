import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type MetadataRowProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
};

export function MetadataRow({ label, value, className, ...props }: MetadataRowProps) {
  return (
    <div className={cn("grid grid-cols-[8rem_minmax(0,1fr)] gap-3 py-1 text-xs", className)} {...props}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-foreground">{value}</dd>
    </div>
  );
}
