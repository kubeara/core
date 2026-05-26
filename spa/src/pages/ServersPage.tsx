import { ServersTable } from "@/components/servers-table";
import { useAuth } from "@/contexts/auth-context";
import { getDisplayName } from "@/lib/user-display";

export function ServersPage() {
  const { user } = useAuth();

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Servers</h1>
          <p>
            Welcome back{user ? `, ${getDisplayName(user)}` : ""}. Manage your connected
            servers and clusters.
          </p>
        </div>
      </header>
      <ServersTable />
    </div>
  );
}
