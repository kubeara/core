import { Outlet } from "react-router-dom";
import { TopBar } from "@/components/shared/top-bar";
import { useAuth } from "@/features/auth/context/use-auth";

/**
 * Protected layout shell for authenticated users.
 */
export function AppLayout() {
    const { user } = useAuth();

    if (!user) {
        return null;
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
