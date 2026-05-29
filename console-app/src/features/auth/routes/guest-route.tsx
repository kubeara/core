import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/use-auth";

/**
 * Route guard for guest-only pages (login, register, etc.).
 * Waits for auth bootstrap before redirecting.
 */
export function GuestRoute() {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return null;
    }

    if (user) {
        return <Navigate to="/servers" replace />;
    }

    return <Outlet />;
}
