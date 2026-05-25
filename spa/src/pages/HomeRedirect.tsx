import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";

export function HomeRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  return <Navigate to={user ? "/servers" : "/login"} replace />;
}
