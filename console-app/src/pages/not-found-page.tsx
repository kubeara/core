import { Link } from "react-router-dom";

/**
 * 404 Not Found page.
 * 
 * Displayed when user navigates to a route that doesn't exist.
 */
export function NotFoundPage() {
    return (
        <div className="dashboard">
            <header className="dashboard-header">
                <div>
                    <h1>Page not found</h1>
                    <p>The page you are looking for does not exist.</p>
                </div>
            </header>
            <p>
                <Link to="/servers">Go to Servers</Link>
            </p>
        </div>
    );
}
