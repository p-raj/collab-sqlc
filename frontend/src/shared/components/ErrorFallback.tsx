import { AlertTriangle, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/Button";
import { CodeBlock } from "./ui/CodeBlock";

interface ErrorFallbackProps {
  error?: Error;
  message?: string;
}

export function ErrorFallback({ error, message }: ErrorFallbackProps) {
  const [showDetails, setShowDetails] = useState(false);
  const isDev = import.meta.env.DEV;

  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-3 p-6 text-center">
      <AlertTriangle size={24} className="text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{message ?? "Something went wrong"}</p>
      <Button onClick={() => window.location.reload()} leftIcon={<RotateCcw size={12} />}>
        Try again
      </Button>

      {isDev && error && (
        <div className="mt-2 w-full max-w-md">
          <Button
            onClick={() => setShowDetails((p) => !p)}
            variant="ghost"
            size="xs"
            leftIcon={showDetails ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          >
            Error details
          </Button>
          {showDetails && (
            <CodeBlock className="mt-1 max-h-40 bg-muted p-2 text-left text-[0.75rem] text-muted-foreground">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </CodeBlock>
          )}
        </div>
      )}
    </div>
  );
}
