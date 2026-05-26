import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../hooks/use-auth-store";
import { ShieldCheck } from "lucide-react";

export default function SecretKeyPage() {
  const navigate = useNavigate();
  const verifySecretKey = useAuthStore((s) => s.verifySecretKey);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const [secretKey, setSecretKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!secretKey.trim()) return;

    setError(null);
    setIsSubmitting(true);
    try {
      await verifySecretKey(secretKey.trim());
      navigate("/editor", { replace: true });
    } catch (err) {
      if (err instanceof Error && "response" in err) {
        try {
          const body = await (err as { response: Response }).response.json() as { message?: string };
          if (body.message) {
            setError(body.message);
            setSecretKey("");
            return;
          }
        } catch { /* fallback below */ }
      }
      setError("Invalid secret key");
      setSecretKey("");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8">
        <div className="space-y-1 text-center">
          <div className="flex justify-center">
            <ShieldCheck size={32} className="text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Verify Identity</h1>
          <p className="text-sm text-muted-foreground">
            Enter your secret key to continue
            {user?.email ? ` as ${user.email}` : ""}
          </p>
        </div>

        {error && (
          <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="secret-key" className="text-sm font-medium">
              Secret Key
            </label>
            <input
              id="secret-key"
              type="password"
              autoComplete="one-time-code"
              autoFocus
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono tracking-widest"
              placeholder="••••••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !secretKey.trim()}
            className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {isSubmitting ? "Verifying..." : "Verify"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleCancel}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel and sign out
        </button>
      </div>
    </div>
  );
}
