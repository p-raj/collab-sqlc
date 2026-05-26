import { AlertTriangle, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

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
      <button
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1.5 rounded border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
      >
        <RotateCcw size={12} />
        Try again
      </button>

      {isDev && error && (
        <div className="mt-2 w-full max-w-md">
          <button
            onClick={() => setShowDetails((p) => !p)}
            className="inline-flex items-center gap-1 text-[0.75rem] text-muted-foreground hover:text-foreground"
          >
            {showDetails ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            Error details
          </button>
          {showDetails && (
            <pre className="mt-1 max-h-40 overflow-auto rounded border border-input bg-muted p-2 text-left text-[0.75rem] text-muted-foreground">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
