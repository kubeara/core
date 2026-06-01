import { ServersTable } from "@/components/servers-table";
import { useAuth } from "@/features/auth/context/use-auth";
import { getDisplayName } from "@/lib/user-display";

/**
 * Servers list page.
 * 
 * Displays a table of all servers with:
 * - Server name, host, username, status
 * - Actions to view details, edit, or delete
 * - Button to add new server
 */
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
