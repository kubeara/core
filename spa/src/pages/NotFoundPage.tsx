import { Link } from "react-router-dom";

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
