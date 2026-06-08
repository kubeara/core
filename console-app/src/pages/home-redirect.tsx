import { Navigate } from "react-router-dom";
import { AppLoadingSkeleton } from "@/components/shared/skeleton";
import { useAuth } from "@/features/auth/context/use-auth";

/**
 * Home page redirect component.
 * 
 * Redirects users based on authentication status:
 * - Authenticated → /servers
 * - Not authenticated → /login
 * 
 * Shows nothing while checking authentication to prevent flash.
 */
export function HomeRedirect() {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return <AppLoadingSkeleton />;
    }

    return <Navigate to={user ? "/servers" : "/login"} replace />;
}
