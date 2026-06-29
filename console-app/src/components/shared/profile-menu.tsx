import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useLogoutMutation } from "@/features/auth/hooks";
import { getDisplayName, getUserInitials } from "@/lib/user-display";
import type { User } from "@/types";
import "./profile-menu.css";

type ProfileMenuProps = {
    user: User;
};

export function ProfileMenu({ user }: ProfileMenuProps) {
    const menuId = useId();
    const pathname = useLocation().pathname;
    const navigate = useNavigate();
    const logoutMutation = useLogoutMutation();
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const isProfileActive = pathname === "/profile";
    const isPlansActive = pathname === "/plans";
    const isInvoicesActive = pathname === "/invoices";

    useEffect(() => {
        if (!open) return;

        function handlePointerDown(event: MouseEvent) {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        }

        function handleEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setOpen(false);
            }
        }

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [open]);

    function handleLogout() {
        setOpen(false);
        logoutMutation.mutate(undefined, {
            onSuccess: () => navigate("/login", { replace: true }),
        });
    }

    return (
        <div ref={rootRef} className="profile-menu">
            <button
                type="button"
                className={`profile-menu-trigger${isProfileActive ? " active" : ""}`}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={menuId}
                onClick={() => setOpen((prev) => !prev)}
            >
                <span className="profile-menu-avatar">
                    {getUserInitials(user)}
                </span>
                <span className="profile-menu-name">{getDisplayName(user)}</span>
                <svg
                    className={`profile-menu-chevron${open ? " is-open" : ""}`}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                >
                    <path
                        d="M6 9l6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </button>
            {open && (
                <div id={menuId} className="profile-menu-dropdown" role="menu">
                    <Link
                        to="/plans"
                        role="menuitem"
                        className={`profile-menu-item${isPlansActive ? " active" : ""}`}
                        onClick={() => setOpen(false)}
                    >
                        Plans
                    </Link>
                    <Link
                        to="/invoices"
                        role="menuitem"
                        className={`profile-menu-item${isInvoicesActive ? " active" : ""}`}
                        onClick={() => setOpen(false)}
                    >
                        Invoices
                    </Link>
                    <Link
                        to="/profile"
                        role="menuitem"
                        className={`profile-menu-item${isProfileActive ? " active" : ""}`}
                        onClick={() => setOpen(false)}
                    >
                        Profile
                    </Link>
                    <button
                        type="button"
                        role="menuitem"
                        className="profile-menu-item profile-menu-item--danger"
                        onClick={handleLogout}
                        disabled={logoutMutation.isPending}
                    >
                        Logout
                    </button>
                </div>
            )}
        </div>
    );
}
