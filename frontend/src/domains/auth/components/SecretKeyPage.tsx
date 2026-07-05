import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../hooks/use-auth-store";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/shared/components/ui/Button";
import { ErrorState } from "@/shared/components/ui/DataState";
import { Field, FieldLabel } from "@/shared/components/ui/Field";
import { Input } from "@/shared/components/ui/Input";
import { Panel } from "@/shared/components/ui/Panel";

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
      <Panel className="w-full max-w-sm space-y-6 rounded-lg p-8">
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

        {error && <ErrorState message={error} className="p-0" />}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="secret-key">Secret Key</FieldLabel>
            <Input
              id="secret-key"
              type="password"
              autoComplete="one-time-code"
              autoFocus
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              size="md"
              className="font-mono tracking-widest"
              placeholder="••••••••••••"
            />
          </Field>

          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={isSubmitting}
            disabled={!secretKey.trim()}
            className="w-full"
          >
            {isSubmitting ? "Verifying..." : "Verify"}
          </Button>
        </form>

        <Button
          type="button"
          onClick={handleCancel}
          variant="ghost"
          size="md"
          className="w-full"
        >
          Cancel and sign out
        </Button>
      </Panel>
    </div>
  );
}
