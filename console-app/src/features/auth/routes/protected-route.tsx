import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AppLoadingSkeleton } from "@/components/shared/skeleton";
import { useAuth } from "../context/use-auth";

/**
 * Route guard for authenticated-only pages.
 * Waits for auth bootstrap before redirecting.
 */
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
