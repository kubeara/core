import { Link } from "react-router-dom";

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
                <Link to="/" className="auth-logo">
                    <span className="auth-logo-mark">K</span>
                    <span>Kubeara</span>
                </Link>
                <div className="auth-card-header">
                    <h1>{title}</h1>
                    {subtitle && <p>{subtitle}</p>}
                </div>
                {children}
                {footer && <div className="auth-card-footer">{footer}</div>}
            </div>
        </div>
    );
}
