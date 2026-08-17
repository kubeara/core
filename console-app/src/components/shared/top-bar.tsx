import { Link, useLocation } from "react-router";
import { KubearaLogo } from "./kubeara-logo";
import { ProfileMenu } from "./profile-menu";
import type { User } from "@/types";

type TopBarProps = {
  user: User;
};

const NAV_ITEMS = [
    { href: "/servers", label: "Servers" },
    { href: "/services", label: "Services" },
    { href: "/compose", label: "Compose" },
    { href: "/mcp-servers", label: "MCP" },
] as const;

/**
 * Top navigation bar component for authenticated users.
 *
 * Features:
 * - Logo and brand name
 * - Navigation links (Servers, Templates)
 * - User profile menu (Profile, Logout)
 *
 * @param user - Current authenticated user
 */
export function TopBar({ user }: TopBarProps) {
  const pathname = useLocation().pathname;

  return (
    <header className="top-bar">
      <div className="top-bar-inner">
        <div className="top-bar-left">
          <Link to="/servers" className="top-bar-logo">
            <KubearaLogo />
          </Link>
          <nav className="top-bar-nav">
            {NAV_ITEMS.map(({ href, label }) => {
              const isActive =
                pathname === href || pathname.startsWith(`${href}/`);

              return (
              <Link
                key={href}
                to={href}
                className={`top-bar-link ${isActive ? "active" : ""}`}
              >
                {label}
              </Link>
              );
            })}
          </nav>
        </div>
        <div className="top-bar-right">
          <ProfileMenu user={user} />
        </div>
      </div>
    </header>
  );
}
