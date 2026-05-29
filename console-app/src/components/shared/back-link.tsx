import { Link } from "react-router-dom";
import "./back-link.css";

type BackLinkProps = {
    to: string;
    label: string;
};

export function BackLink({ to, label }: BackLinkProps) {
    return (
        <Link to={to} className="back-link" aria-label={label}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                    d="M19 12H5M12 19l-7-7 7-7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </Link>
    );
}
