import type { SetupGuide } from "../types";
import { MCP_SERVER_PUBLIC_URL } from "../lib/mcp-config";

export const SETUP_GUIDES: SetupGuide[] = [
  {
    id: "cursor",
    label: "Cursor",
    title: "Connecting Kubera to Cursor via MCP",
    intro:
      "Connect Cursor to your Kubera workspace using the Model Context Protocol. Once set up, Cursor can read server data, check statuses, and interact with your infrastructure directly from chat.",
    requirements: [
      "Cursor desktop app installed on your machine",
      "A Kubera account with MCP Server enabled",
      "Your Kubera MCP token — generated from the MCP page",
    ],
    steps: [
      {
        title: "Open Cursor Settings",
        body: "Open the Cursor desktop app. In the top menu bar click Cursor → Settings.",
      },
      {
        title: "Go to Tools & MCP Servers",
        body: "In the Settings sidebar, scroll down and click on Tools & MCP Servers.",
      },
      {
        title: "Add a New MCP Server",
        body: "Click the Add MCP Server button. Cursor will open your mcp.json configuration file in the editor.",
      },
      {
        title: "Paste the Kubera Configuration",
        body: "In the mcp.json file, paste the configuration below. Replace YOUR_TOKEN_HERE with the token generated on the Kubera MCP Servers page.",
        configPreset: "cursor",
        note: "Your token is shown only once on the Kubera dashboard. If you have lost it, go back to the MCP Servers page and generate a new one.",
      },
      {
        title: "Save and Restart",
        body: "Save the file with Cmd + S (Mac) or Ctrl + S (Windows). Then fully close and reopen Cursor for the changes to take effect.",
      },
      {
        title: "Verify the Connection",
        body: "Go back to Settings → Tools & MCP Servers. You should see Kubera listed there with a green connected status. Once connected, open a Cursor chat and ask it anything about your servers — if it responds with your real data, you're all set.",
      },
    ],
    troubleshooting: [
      {
        issue: "Kubera not showing in tools list",
        fix: "Check that the token is correct and not expired",
      },
      {
        issue: "Token invalid or rejected",
        fix: "MCP Servers page → revoke old key → generate a new one",
      },
    ],
    outro:
      "Cursor is now connected to your Kubera workspace. Your AI assistant can list servers, check GPU metrics, get server status, and more — all from the chat window.",
    available: true,
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    title: "Connecting Kubera to Claude Desktop via MCP",
    intro:
      "Connect Claude Desktop to your Kubera workspace using the Model Context Protocol. Once set up, Claude can read server data, check statuses, and interact with your infrastructure directly from chat.",
    requirements: [
      "Claude Desktop app installed on your machine",
      "Node.js installed (required for npx and mcp-remote)",
      "A Kubera account with MCP Server enabled",
      "Your Kubera MCP token — generated from the MCP page",
    ],
    steps: [
      {
        title: "Open Claude Desktop",
        body: "Launch the Claude Desktop app on your machine.",
      },
      {
        title: "Open Settings",
        body: "Click your profile icon in the bottom-left corner, then select Settings from the menu.",
      },
      {
        title: "Go to Developer Options",
        body: "In Settings, open the Desktop app section, then click Developer options.",
      },
      {
        title: "Edit the MCP Config",
        body: "Under Local MCP servers, click Edit config. Claude will open your claude_desktop_config.json file in your default editor.",
      },
      {
        title: "Add the Kubera Configuration",
        body: "At the top of claude_desktop_config.json, add the configuration below. Replace YOUR_TOKEN_HERE with the token generated on the Kubera MCP page.",
        configPreset: "claude-desktop",
        note: "Your token is shown only once on the Kubera dashboard. If you have lost it, go back to the MCP page and generate a new one.",
      },
      {
        title: "Save the File",
        body: "Save claude_desktop_config.json with Cmd + S (Mac) or Ctrl + S (Windows).",
      },
      {
        title: "Restart Claude Desktop",
        body: "Fully quit Claude Desktop so the process stops — on Mac use Cmd + Q or Force Quit from Activity Monitor; on Windows close it from the system tray or Task Manager. Then reopen Claude Desktop.",
      },
      {
        title: "Verify the Connection",
        body: "Go back to Settings → Desktop app → Developer options → Local MCP servers. You should see kubera listed there with a connected, running status. Once connected, open a Claude chat and ask it anything about your servers — if it responds with your real data, you're all set.",
      },
    ],
    troubleshooting: [
      {
        issue: "Kubera not showing in Local MCP servers",
        fix: "Check that the token is correct, Node.js is installed, and the config JSON is valid",
      },
      {
        issue: "Token invalid or rejected",
        fix: "MCP page → revoke old key → generate a new one and update KUBERA_MCP_TOKEN",
      },
    ],
    outro:
      "Claude Desktop is now connected to your Kubera workspace. Your AI assistant can list servers, check GPU metrics, get server status, and more — all from the chat window.",
    available: true,
  },
  {
    id: "vscode",
    label: "VS Code with Copilot",
    title: "Connecting Kubera to VS Code with Copilot via MCP",
    intro:
      "Connect VS Code to your Kubera workspace using the Model Context Protocol. Once set up, GitHub Copilot in VS Code can read server data, check statuses, and interact with your infrastructure directly from chat.",
    requirements: [
      "VS Code installed on your machine",
      "GitHub Copilot extension enabled in VS Code",
      "A Kubera account with MCP Server enabled",
      "Your Kubera MCP token — generated from the MCP page",
    ],
    steps: [
      {
        title: "Open the Command Palette",
        body: "Open VS Code. Press Ctrl + Shift + P (Windows/Linux) or Cmd + Shift + P (Mac) to open the Command Palette.",
      },
      {
        title: "Add an MCP Server",
        body: 'Type "add mcp" in the Command Palette and select MCP: Add Server.',
      },
      {
        title: "Select HTTP Transport",
        body: 'When prompted for the transport type, select HTTP from the dropdown and press Enter.',
      },
      {
        title: "Enter the Kubera MCP URL",
        body: "When prompted for the server URL, paste the Kubera MCP endpoint below and press Enter.",
        example: MCP_SERVER_PUBLIC_URL,
      },
      {
        title: "Name Your Server",
        body: 'When prompted for a name, enter a short label such as kubera or Kubera MCP, then press Enter.',
      },
      {
        title: "Dismiss the OAuth Popup",
        body: 'VS Code may show a popup saying dynamic client registration is not supported. Click Cancel on that dialog — you may need to cancel twice. This is expected; Kubera uses a bearer token instead of OAuth.',
      },
      {
        title: "Paste the Kubera Configuration",
        body: "VS Code opens your mcp.json file. Replace its contents with the configuration below. Replace YOUR_TOKEN_HERE with the token generated on the Kubera MCP Servers page.",
        configPreset: "vscode",
        note: "Your token is shown only once on the Kubera dashboard. If you have lost it, go back to the MCP Servers page and generate a new one.",
      },
      {
        title: "Save the File",
        body: "Save mcp.json with Cmd + S (Mac) or Ctrl + S (Windows).",
      },
      {
        title: "Start the MCP Server",
        body: 'Press Ctrl + Shift + P (or Cmd + Shift + P on Mac) again, type "mcp list", and select MCP: List Servers. Choose your Kubera server from the list and select Start Server.',
      },
      {
        title: "Verify the Connection",
        body: "Check the VS Code terminal for connection logs — you should see your connected tools listed. Open a Copilot chat and ask about your servers. If it responds with your real data, you're all set.",
      },
    ],
    troubleshooting: [
      {
        issue: "Dynamic client registration not supported popup",
        fix: "Click Cancel on the popup, then add your bearer token in mcp.json as shown in the configuration step",
      },
      {
        issue: "Kubera not showing in MCP server list",
        fix: "Check that mcp.json is valid JSON and the Authorization header contains your token",
      },
      {
        issue: "Token invalid or rejected",
        fix: "MCP Servers page → revoke old key → generate a new one and update mcp.json",
      },
    ],
    outro:
      "VS Code is now connected to your Kubera workspace. Your AI assistant can list servers, check GPU metrics, get server status, and more — all from the Copilot chat window.",
    available: true,
  },
  {
    id: "windsurf",
    label: "Windsurf",
    title: "Connecting Kubera to Windsurf via MCP",
    intro:
      "Connect Windsurf to your Kubera workspace using the Model Context Protocol. Once set up, Windsurf can read server data, check statuses, and interact with your infrastructure directly from Cascade chat.",
    requirements: [
      "Windsurf desktop app installed on your machine",
      "A Kubera account with MCP Server enabled",
      "Your Kubera MCP token — generated from the MCP page",
    ],
    steps: [
      {
        title: "Open Windsurf Desktop",
        body: "Launch the Windsurf desktop app on your machine.",
      },
      {
        title: "Open Windsurf Settings",
        body: "open Windsurf settings.",
      },
      {
        title: "Go to Cascade → MCP Servers",
        body: "In settings, open the Cascade section, then select MCP Servers.",
      },
      {
        title: "Open MCP Marketplace",
        body: "Click Open MCP Marketplace to view your installed MCP servers.",
      },
      {
        title: "Open Installed MCP Settings",
        body: "Under Installed MCP, click the settings button on the right to open your MCP configuration.",
      },
      {
        title: "Add the Kubera Configuration",
        body: "In the mcpServers section, add the kubera entry below. If you already have other MCP servers configured, add kubera alongside them — do not remove your existing entries. Replace YOUR_TOKEN_HERE with the token generated on the Kubera MCP page.",
        configPreset: "windsurf",
        note: "Your token is shown only once on the Kubera dashboard. If you have lost it, go back to the MCP page and generate a new one.",
      },
      {
        title: "Save the Configuration",
        body: "Save the configuration file with Cmd + S (Mac) or Ctrl + S (Windows), then return to Windsurf.",
      },
      {
        title: "Verify in MCP Marketplace",
        body: "Go back to MCP Marketplace. You should see Kubera listed under Installed MCP.",
      },
      {
        title: "Verify the Connection",
        body: "Open a Windsurf Cascade chat. You should see Kubera available as an MCP server. Ask it anything about your servers — if it responds with your real data, you're all set.",
      },
    ],
    troubleshooting: [
      {
        issue: "Kubera not showing in MCP Marketplace",
        fix: "Check that the kubera entry is saved correctly inside mcpServers and the JSON is valid",
      },
      {
        issue: "Token invalid or rejected",
        fix: "MCP page → revoke old key → generate a new one",
      },
    ],
    outro:
      "Windsurf is now connected to your Kubera workspace. Your AI assistant can list servers, check GPU metrics, get server status, and more — all from the Cascade chat window.",
    available: true,
  },
  {
    id: "antigravity",
    label: "Antigravity",
    title: "Connecting Kubera to Antigravity via MCP",
    intro:
      "Connect Antigravity to your Kubera workspace using the Model Context Protocol. Once set up, Antigravity can read server data, check statuses, and interact with your infrastructure directly from the Agent chat.",
    requirements: [
      "Antigravity desktop app installed on your machine",
      "A Kubera account with MCP Server enabled",
      "Your Kubera MCP token — generated from the MCP page",
    ],
    steps: [
      {
        title: "Open Antigravity Desktop",
        body: "Launch the Antigravity desktop app on your machine.",
      },
      {
        title: "Open the Agent Panel Menu",
        body: "In the Agent section, click the three-dot (...) menu at the top of the Agent Panel — it is usually docked on the right side of your workspace.",
      },
      {
        title: "Open MCP Servers",
        body: "From the menu, select MCP Servers. This opens the MCP store.",
      },
      {
        title: "Manage MCP Servers",
        body: "At the top of the MCP store, click Manage MCP servers to open the manage MCP servers tab.",
      },
      {
        title: "View Raw Config",
        body: "In the manage MCP servers tab, click View raw config to open your MCP configuration file.",
      },
      {
        title: "Add the Kubera Configuration",
        body: "In the mcpServers section, add the kubera entry below. If you already have other MCP servers configured, add kubera alongside them — do not remove your existing entries. Replace YOUR_TOKEN_HERE with the token generated on the Kubera MCP page.",
        configPreset: "antigravity",
        note: "Your token is shown only once on the Kubera dashboard. If you have lost it, go back to the MCP page and generate a new one.",
      },
      {
        title: "Save the Configuration",
        body: "Save the configuration file with Cmd + S (Mac) or Ctrl + S (Windows), then return to Antigravity.",
      },
      {
        title: "Refresh MCP Servers",
        body: "Go back to MCP Servers and refresh the page. You should see kubera listed there.",
      },
      {
        title: "Configure Kubera",
        body: "Click on kubera in the MCP servers list and complete any setup prompts to enable the connection.",
      },
      {
        title: "Verify the Connection",
        body: "Open an Agent chat in Antigravity. You should see Kubera available as an MCP server. Ask it anything about your servers — if it responds with your real data, you're all set.",
      },
    ],
    troubleshooting: [
      {
        issue: "Kubera not showing in MCP servers",
        fix: "Check that the kubera entry is saved correctly inside mcpServers, refresh the page, and confirm the JSON is valid",
      },
      {
        issue: "Token invalid or rejected",
        fix: "MCP page → revoke old key → generate a new one",
      },
    ],
    outro:
      "Antigravity is now connected to your Kubera workspace. Your AI assistant can list servers, check GPU metrics, get server status, and more — all from the Agent chat window.",
    available: true,
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    title: "Connecting Kubera to ChatGPT via MCP",
    intro:
      "Connect ChatGPT to your Kubera workspace using OAuth. ChatGPT does not support static MCP API keys — you sign in with your Kubera account when ChatGPT requests access. Desktop clients such as Cursor still use MCP API keys from this page.",
    requirements: [
      "ChatGPT Business, Enterprise, Edu, or Pro with Developer mode enabled",
      "Workspace admin approval to create and publish MCP apps (Business/Enterprise/Edu)",
      "A Kubera account with access to the servers you want ChatGPT to read",
      "Kubera MCP endpoint reachable over public HTTPS",
    ],
    steps: [
      {
        title: "Open ChatGPT Settings",
        body: "Open ChatGPT in your browser. Click your profile or workspace menu, then open Settings from the bottom of the left sidebar.",
      },
      {
        title: "Go to Apps",
        body: "In Settings, open the Apps section. Under Advanced settings, turn on Developer mode if it is not already enabled. On Business and Enterprise workspaces, an admin may need to enable this under Workspace settings first.",
      },
      {
        title: "Create a New App",
        body: 'Click Create (or Create app). Enter a name you will recognize, such as Kubera. Add a short description if you want — for example, "Access my Kubera servers from ChatGPT".',
      },
      {
        title: "Paste the Kubera MCP URL",
        body: "In the Connection section, find the server URL field. Paste our Kubera MCP endpoint below.",
        configPreset: "chatgpt",
      },
      {
        title: "Choose OAuth Authentication",
        body: "Under Authentication, select OAuth (not API key). OAuth is required for ChatGPT — Kubera MCP API keys from this page do not work in ChatGPT.",
      },
      {
        title: "Open Advanced OAuth Settings",
        body: "Click Advanced OAuth settings. A panel opens on the right with OAuth details. ChatGPT and your Kubera server usually pre-fill most fields after you paste the MCP URL.",
      },
      {
        title: "Set the OAuth Client ID",
        body: 'In the Client registration section, set OAuth Client ID to https://chatgpt.com/ (include the trailing slash). This is required for security — Kubera only accepts ChatGPT as an OAuth client. You do not need a client secret; leave that blank if the field is optional.',
        example: "https://chatgpt.com/",
      },
      {
        title: "Confirm and Create the App",
        body: 'Review the settings, click I understand and continue (or the equivalent confirmation), then click Create. ChatGPT may take a moment to register the connector and scan available tools.',
      },
      {
        title: "Sign In with Kubera",
        body: 'When prompted with Add [your app name] to ChatGPT, click Sign in with Kubera (or the name you chose). ChatGPT opens a new browser window or tab for authorization — keep the ChatGPT tab open while you complete this step.',
      },
      {
        title: "Log In to Kubera (If Needed)",
        body: "If you are already signed in to Kubera in that browser, you will go straight to the consent screen. If not, the Kubera login page opens — enter your Kubera email and password and click Sign in. You will then be returned to the OAuth authorization page (not the main dashboard).",
        note: "Use your Kubera console email and password. MCP API keys from this page do not work here.",
      },
      {
        title: "Authorize ChatGPT",
        body: 'On the Connect ChatGPT to Kubera screen, review the requested access (mcp:read, mcp:write) and click Authorize. This step is required — signing in alone does not finish the connection. The window closes automatically and you are sent back to ChatGPT.',
      },
      {
        title: "Test in a Chat",
        body: "Open a new chat. Ask about your servers — for example, list my servers in Kubera.",
      },
    ],
    troubleshooting: [
      {
        issue: "Invalid client ID",
        fix: 'Set OAuth Client ID to https://chatgpt.com/ in Advanced OAuth settings.',
      },
      {
        issue: "Sign-in window keeps loading",
        fix: "Complete the full flow: Sign in → Connect ChatGPT to Kubera → Authorize. Signing in alone is not enough.",
      },
      {
        issue: "Login fails",
        fix: "Use your Kubera console email and password. MCP API keys from this page do not work in ChatGPT.",
      },
    ],
    outro:
      "ChatGPT is now connected to Kubera through OAuth. Your Kubera user identity controls which servers and metrics ChatGPT can access.",
    available: true,
  },
];

export function getSetupGuideById(id: string): SetupGuide | undefined {
  return SETUP_GUIDES.find((guide) => guide.id === id);
}
