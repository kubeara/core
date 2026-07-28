import { Navigate, Outlet, useLocation } from "react-router";
import { AppLoadingSkeleton } from "@/components/shared/skeleton";
import { useAuth } from "../context/use-auth";

function resolvePostAuthRedirect(search: string): string {
  const from = new URLSearchParams(search).get("from")?.trim();
  if (from && from.startsWith("/")) {
    return from;
  }
  return "/servers";
}

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <AppLoadingSkeleton />;
  }

  if (!user) {
    const from = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?from=${from}`} replace />;
  }

  return <Outlet />;
}

export function GuestRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <AppLoadingSkeleton />;
  }

  if (user) {
    return (
      <Navigate to={resolvePostAuthRedirect(location.search)} replace />
    );
  }

  return <Outlet />;
}

export function HomeRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <AppLoadingSkeleton />;
  }

  return <Navigate to={user ? "/servers" : "/login"} replace />;
}
