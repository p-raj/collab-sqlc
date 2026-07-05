import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/shared/components/ui/Button";
import { ErrorState } from "@/shared/components/ui/DataState";
import { Field, FieldError, FieldLabel } from "@/shared/components/ui/Field";
import { Input } from "@/shared/components/ui/Input";
import { Panel } from "@/shared/components/ui/Panel";
import { useAuthStore } from "../hooks/use-auth-store";
import * as authApi from "../services/auth-api";

const registerSchema = z
  .object({
    display_name: z.string().min(1, "Display name is required"),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("token");
  const setTokenAndLoadUser = useAuthStore((s) => s.setTokenAndLoadUser);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(data: RegisterForm) {
    setError(null);
    try {
      const tokens = await authApi.register(
        { email: data.email, password: data.password, display_name: data.display_name },
        inviteToken ?? undefined,
      );
      await setTokenAndLoadUser(tokens.access_token);
      navigate("/editor", { replace: true });
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "response" in err &&
        (err as { response: { status: number } }).response?.status === 409
      ) {
        setError("An account with this email already exists");
      } else if (
        err &&
        typeof err === "object" &&
        "response" in err &&
        (err as { response: { status: number } }).response?.status === 403
      ) {
        setError("Registration requires a valid invite link. Contact your admin.");
      } else {
        setError("Registration failed. Please try again.");
      }
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Panel className="w-full max-w-sm space-y-6 rounded-lg p-8">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold tracking-tight">OOISH!</h1>
          <p className="text-sm text-muted-foreground">
            {inviteToken ? "Accept your invite" : "Create the first admin account"}
          </p>
        </div>

        {error && <ErrorState message={error} className="p-0" />}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="display_name">Display name</FieldLabel>
            <Input
              id="display_name"
              type="text"
              autoComplete="name"
              autoFocus
              size="md"
              placeholder="Jane Doe"
              {...register("display_name")}
            />
            {errors.display_name && <FieldError>{errors.display_name.message}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
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
              autoComplete="new-password"
              size="md"
              placeholder="••••••••"
              {...register("password")}
            />
            {errors.password && <FieldError>{errors.password.message}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              size="md"
              placeholder="••••••••"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && <FieldError>{errors.confirmPassword.message}</FieldError>}
          </Field>

          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </Panel>
    </div>
  );
}
