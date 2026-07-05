import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Github } from "lucide-react";
import { Button } from "@/shared/components/ui/Button";
import { ErrorState } from "@/shared/components/ui/DataState";
import { Field, FieldError, FieldLabel } from "@/shared/components/ui/Field";
import { Input } from "@/shared/components/ui/Input";
import { Panel } from "@/shared/components/ui/Panel";
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
      <Panel className="w-full max-w-sm space-y-6 rounded-lg p-8">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold tracking-tight">OOISH!</h1>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </div>

        {error && <ErrorState message={error} className="p-0" />}

        {showEmailForm && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                size="md"
                placeholder="you@example.com"
                {...register("email")}
              />
              {errors.email && <FieldError>{errors.email.message}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                size="md"
                placeholder="••••••••"
                {...register("password")}
              />
              {errors.password && <FieldError>{errors.password.message}</FieldError>}
            </Field>

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
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
          <Button
            type="button"
            onClick={handleGitHubLogin}
            loading={ssoLoading}
            leftIcon={<Github size={16} />}
            className="w-full"
            size="md"
          >
            Sign in with GitHub
          </Button>
        )}
      </Panel>
    </div>
  );
}
