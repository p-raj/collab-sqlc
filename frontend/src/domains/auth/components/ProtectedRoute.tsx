import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../hooks/use-auth-store";

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, needsVerification } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (needsVerification && location.pathname !== "/verify") {
    return <Navigate to="/verify" replace />;
  }

  return <Outlet />;
}
