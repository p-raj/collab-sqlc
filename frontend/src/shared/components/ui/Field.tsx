import { type HTMLAttributes, type LabelHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type FieldProps = HTMLAttributes<HTMLDivElement>;

export function Field({ className, ...props }: FieldProps) {
  return <div className={cn("flex flex-col gap-0.5", className)} {...props} />;
}

type FieldLabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export function FieldLabel({ className, ...props }: FieldLabelProps) {
  return <label className={cn("text-xs text-muted-foreground", className)} {...props} />;
}

type FieldHintProps = HTMLAttributes<HTMLParagraphElement>;

export function FieldHint({ className, ...props }: FieldHintProps) {
  return <p className={cn("text-[0.75rem] text-muted-foreground/70", className)} {...props} />;
}

type FieldErrorProps = HTMLAttributes<HTMLParagraphElement> & {
  children?: ReactNode;
};

export function FieldError({ className, children, ...props }: FieldErrorProps) {
  if (!children) return null;

  return (
    <p role="alert" className={cn("text-[0.75rem] text-destructive", className)} {...props}>
      {children}
    </p>
  );
}
