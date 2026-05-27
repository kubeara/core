import { Outlet } from "react-router-dom";
import { ThemeToggle } from "@/components/shared/theme-toggle";

/**
 * Guest auth page shell (login, register, password reset).
 */
export function AuthLayout() {
    return (
        <>
            <div className="auth-theme-toggle">
                <ThemeToggle />
            </div>
            <Outlet />
        </>
    );
}
