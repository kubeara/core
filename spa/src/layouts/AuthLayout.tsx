import { Navigate, Outlet } from "react-router-dom";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/contexts/auth-context";

export function AuthLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (user) {
    return <Navigate to="/servers" replace />;
  }

  return (
    <>
      <div className="auth-theme-toggle">
        <ThemeToggle />
      </div>
      <Outlet />
    </>
  );
}
