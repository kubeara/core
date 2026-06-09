import { Link } from "react-router-dom";
import { KubearaLogo } from "@/components/shared/kubeara-logo";

type AuthCardProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

/**
 * Authentication page card wrapper.
 *
 * Provides consistent layout for all auth pages:
 * - Logo
 * - Title and subtitle
 * - Form content
 * - Footer links
 */

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="flex justify-center">
          <Link to="/" className="auth-logo">
            <KubearaLogo />
          </Link>
        </div>

        <div className="auth-card-header">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>

        {children}

        {footer && <div className="auth-card-footer">{footer}</div>}
      </div>
    </div>
  );
}
