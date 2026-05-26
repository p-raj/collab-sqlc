import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/shared/contexts/theme-provider";
import { useTheme } from "@/shared/contexts/theme-context";
import { EyloProvider } from "@/shared/contexts/eylo-provider";
import { AppLayout } from "@/layouts/AppLayout";
import { ProtectedRoute } from "@/domains/auth/components/ProtectedRoute";
import { useAuthStore } from "@/domains/auth/hooks/use-auth-store";
import { ErrorBoundary } from "@/shared/components/ErrorBoundary";

const LoginPage = lazy(() => import("@/domains/auth/components/LoginPage"));
const RegisterPage = lazy(() => import("@/domains/auth/components/RegisterPage"));
const GitHubCallbackPage = lazy(() => import("@/domains/auth/components/GitHubCallbackPage"));
const SecretKeyPage = lazy(() => import("@/domains/auth/components/SecretKeyPage"));
const EditorPage = lazy(() => import("@/domains/editor/components/EditorPage"));

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-muted-foreground text-sm">Loading...</div>
    </div>
  );
}

function AuthInit({ children }: { children: React.ReactNode }) {
  const loadUser = useAuthStore((s) => s.loadUser);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  return (
    <EyloProvider user={user}>
      {children}
    </EyloProvider>
  );
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      richColors
      position="bottom-right"
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ThemedToaster />
      <AuthInit>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <ErrorBoundary>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/auth/github/callback" element={<GitHubCallbackPage />} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/verify" element={<SecretKeyPage />} />
                  <Route path="/" element={<AppLayout />}>
                    <Route index element={<Navigate to="/editor" replace />} />
                    <Route path="editor" element={<EditorPage />} />
                  </Route>
                </Route>
              </Routes>
            </ErrorBoundary>
          </Suspense>
        </BrowserRouter>
      </AuthInit>
    </ThemeProvider>
  );
}
