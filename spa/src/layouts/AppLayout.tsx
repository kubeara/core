import { Navigate, Outlet, useLocation } from "react-router-dom";
import { TopBar } from "@/components/top-bar";
import { useAuth } from "@/contexts/auth-context";

export function AppLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return null;
  }

  if (!user) {
    const from = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?from=${from}`} replace />;
  }

  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
