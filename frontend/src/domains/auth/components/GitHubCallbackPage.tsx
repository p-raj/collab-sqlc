import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "../hooks/use-auth-store";
import * as authApi from "../services/auth-api";

export default function GitHubCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setTokenAndLoadUser = useAuthStore((s) => s.setTokenAndLoadUser);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      setError("Missing authorization parameters.");
      return;
    }

    let cancelled = false;

    async function exchange() {
      try {
        const response = await authApi.exchangeGitHubCode(code!, state!);
        if (cancelled) return;
        await setTokenAndLoadUser(response.access_token);
        navigate("/editor", { replace: true });
      } catch {
        if (!cancelled) {
          setError("GitHub sign-in failed. Please try again.");
        }
      }
    }

    exchange();
    return () => {
      cancelled = true;
    };
  }, [searchParams, setTokenAndLoadUser, navigate]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-8 text-center">
          <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
          <Link
            to="/login"
            className="inline-flex h-9 items-center justify-center rounded-md border border-input px-4 text-sm font-medium transition-colors hover:bg-accent"
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-2">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Signing in...</span>
      </div>
    </div>
  );
}
