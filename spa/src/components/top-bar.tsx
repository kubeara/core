import { Link, useLocation, useNavigate } from "react-router-dom";
import { useLogoutMutation } from "@/api/hooks/use-auth";
import { ThemeToggle } from "./theme-toggle";
import { getDisplayName, getUserInitials } from "@/lib/user-display";
import type { User } from "@/lib/types";

type TopBarProps = {
  user: User;
};

const navItems = [
  { href: "/servers", label: "Servers" },
  { href: "/templates", label: "Templates" },
] as const;

export function TopBar({ user }: TopBarProps) {
  const pathname = useLocation().pathname;
  const navigate = useNavigate();
  const logoutMutation = useLogoutMutation();

  function handleLogout() {
    logoutMutation.mutate(undefined, {
      onSuccess: () => navigate("/login", { replace: true }),
    });
  }

  return (
    <header className="top-bar">
      <div className="top-bar-inner">
        <div className="top-bar-left">
          <Link to="/servers" className="top-bar-logo">
            <span className="top-bar-logo-mark">K</span>
            <span>Kubeara</span>
          </Link>
          <nav className="top-bar-nav">
            {navItems.map(({ href, label }) => (
              <Link
                key={href}
                to={href}
                className={`top-bar-link ${pathname === href || pathname.startsWith(`${href}/`) ? "active" : ""}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="top-bar-right">
          <ThemeToggle />
          <Link
            to="/profile"
            className={`top-bar-profile ${pathname === "/profile" ? "active" : ""}`}
          >
            <span className="top-bar-avatar">
              {user.profilePicture ? (
                <img src={user.profilePicture} alt="" className="top-bar-avatar-img" />
              ) : (
                getUserInitials(user)
              )}
            </span>
            <span className="top-bar-profile-text">{getDisplayName(user)}</span>
          </Link>
          <button type="button" onClick={handleLogout} className="top-bar-logout">
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
