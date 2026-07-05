import { type ButtonHTMLAttributes, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

type TabsRootProps = HTMLAttributes<HTMLDivElement>;

export function TabsRoot({ className, ...props }: TabsRootProps) {
  return <div className={cn("flex items-center gap-3", className)} {...props} />;
}

const tabButtonVariants = cva(
  "h-toolbar text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus",
  {
    variants: {
      active: {
        true: "border-b-2 border-foreground font-medium text-foreground",
        false: "text-muted-foreground hover:text-foreground",
      },
    },
    defaultVariants: {
      active: false,
    },
  },
);

type TabButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof tabButtonVariants>;

export function TabButton({ className, active, type = "button", ...props }: TabButtonProps) {
  return (
    <button
      type={type}
      className={cn(tabButtonVariants({ active }), className)}
      {...props}
    />
  );
}
