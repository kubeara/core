import { McpKeysSection } from "@/features/mcp-servers/components/mcp-keys-section";
import { SetupGuidesSection } from "@/features/mcp-servers/components/setup-guides-section";
import "@/features/mcp-servers/mcp-servers.css";

/**
 * Kubera MCP page.
 *
 * Allows users to generate tokens and download setup guides for supported
 * AI desktop clients.
 */
export function McpServersPage() {
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Kubera's MCP</h1>
          <p>
            Give your AI assistant direct access to your servers. Supported on
            Cursor, Claude Desktop, Windsurf, and Antigravity.
          </p>
        </div>
      </header>

      <div className="mcp-servers-page-body">
        <McpKeysSection />
        <SetupGuidesSection />
      </div>
    </div>
  );
}
