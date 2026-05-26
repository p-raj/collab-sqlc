import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Github, Loader2 } from "lucide-react";
import { useAuthStore } from "../hooks/use-auth-store";
import * as authApi from "../services/auth-api";
import type { SSOConfig } from "../types";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [error, setError] = useState<string | null>(null);
  const [ssoConfig, setSsoConfig] = useState<SSOConfig | null>(null);
  const [ssoLoading, setSsoLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    authApi
      .getSSOConfig()
      .then(setSsoConfig)
      .catch(() => {
        // SSO not available — keep ssoConfig null
      });
  }, []);

  async function onSubmit(data: LoginForm) {
    setError(null);
    try {
      await login(data.email, data.password);
      // Auth store sets needsVerification — ProtectedRoute handles redirect
      navigate("/editor", { replace: true });
    } catch (err) {
      if (err instanceof Error && "response" in err) {
        try {
          const body = await (err as { response: Response }).response.json() as { message?: string };
          if (body.message) {
            setError(body.message);
            return;
          }
        } catch { /* fallback below */ }
      }
      setError("Invalid email or password");
    }
  }

  async function handleGitHubLogin() {
    setSsoLoading(true);
    setError(null);
    try {
      const { authorize_url } = await authApi.getGitHubAuthorizeUrl();
      window.location.href = authorize_url;
    } catch {
      setError("Failed to initiate GitHub sign-in.");
      setSsoLoading(false);
    }
  }

  const showEmailForm = !ssoConfig || !ssoConfig.sso_only_mode;
  const showGitHub = ssoConfig?.sso_enabled === true;

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold tracking-tight">OOISH!</h1>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </div>

        {error && (
          <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {showEmailForm && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="you@example.com"
                {...register("email")}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="••••••••"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        )}

        {showGitHub && showEmailForm && (
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}

        {showGitHub && (
          <button
            type="button"
            onClick={handleGitHubLogin}
            disabled={ssoLoading}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-input bg-transparent px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          >
            {ssoLoading ? <Loader2 size={16} className="animate-spin" /> : <Github size={16} />}
            Sign in with GitHub
          </button>
        )}
      </div>
    </div>
  );
}
