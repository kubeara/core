import type { SetupGuide } from "../types";
import { MCP_SERVER_PUBLIC_URL } from "../lib/mcp-config";

export const SETUP_GUIDES: SetupGuide[] = [
  {
    id: "cursor",
    label: "Cursor",
    title: "Connecting Kubeara to Cursor via MCP",
    intro:
      "Connect Cursor to your Kubeara workspace using the Model Context Protocol. Once set up, Cursor can read server data, check statuses, and interact with your infrastructure directly from chat.",
    requirements: [
      "Cursor desktop app installed on your machine",
      "A Kubeara account with MCP Server enabled",
      "Your Kubeara MCP token — generated from the MCP page",
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
        title: "Paste the Kubeara Configuration",
        body: "In the mcp.json file, paste the configuration below. Replace YOUR_TOKEN_HERE with the token generated on the Kubeara MCP Servers page.",
        configPreset: "cursor",
        note: "Your token is shown only once on the Kubeara dashboard. If you have lost it, go back to the MCP Servers page and generate a new one.",
      },
      {
        title: "Save and Restart",
        body: "Save the file with Cmd + S (Mac) or Ctrl + S (Windows). Then fully close and reopen Cursor for the changes to take effect.",
      },
      {
        title: "Verify the Connection",
        body: "Go back to Settings → Tools & MCP Servers. You should see Kubeara listed there with a green connected status. Once connected, open a Cursor chat and ask it anything about your servers — if it responds with your real data, you're all set.",
      },
    ],
    troubleshooting: [
      {
        issue: "Kubeara not showing in tools list",
        fix: "Check that the token is correct and not expired",
      },
      {
        issue: "Token invalid or rejected",
        fix: "MCP Servers page → revoke old key → generate a new one",
      },
    ],
    outro:
      "Cursor is now connected to your Kubeara workspace. Your AI assistant can list servers, check GPU metrics, get server status, and more — all from the chat window.",
    available: true,
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    title: "Connecting Kubeara to Claude Desktop via MCP",
    intro:
      "Connect Claude Desktop to your Kubeara workspace using the Model Context Protocol. Once set up, Claude can read server data, check statuses, and interact with your infrastructure directly from chat.",
    requirements: [
      "Claude Desktop app installed on your machine",
      "Node.js installed (required for npx and mcp-remote)",
      "A Kubeara account with MCP Server enabled",
      "Your Kubeara MCP token — generated from the MCP page",
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
        title: "Add the Kubeara Configuration",
        body: "At the top of claude_desktop_config.json, add the configuration below. Replace YOUR_TOKEN_HERE with the token generated on the Kubeara MCP page.",
        configPreset: "claude-desktop",
        note: "Your token is shown only once on the Kubeara dashboard. If you have lost it, go back to the MCP page and generate a new one.",
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
        body: "Go back to Settings → Desktop app → Developer options → Local MCP servers. You should see kubeara listed there with a connected, running status. Once connected, open a Claude chat and ask it anything about your servers — if it responds with your real data, you're all set.",
      },
    ],
    troubleshooting: [
      {
        issue: "Kubeara not showing in Local MCP servers",
        fix: "Check that the token is correct, Node.js is installed, and the config JSON is valid",
      },
      {
        issue: "Token invalid or rejected",
        fix: "MCP page → revoke old key → generate a new one and update KUBEARA_MCP_TOKEN",
      },
    ],
    outro:
      "Claude Desktop is now connected to your Kubeara workspace. Your AI assistant can list servers, check GPU metrics, get server status, and more — all from the chat window.",
    available: true,
  },
  {
    id: "vscode",
    label: "VS Code with Copilot",
    title: "Connecting Kubeara to VS Code with Copilot via MCP",
    intro:
      "Connect VS Code to your Kubeara workspace using the Model Context Protocol. Once set up, GitHub Copilot in VS Code can read server data, check statuses, and interact with your infrastructure directly from chat.",
    requirements: [
      "VS Code installed on your machine",
      "GitHub Copilot extension enabled in VS Code",
      "A Kubeara account with MCP Server enabled",
      "Your Kubeara MCP token — generated from the MCP page",
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
        title: "Enter the Kubeara MCP URL",
        body: "When prompted for the server URL, paste the Kubeara MCP endpoint below and press Enter.",
        example: MCP_SERVER_PUBLIC_URL,
      },
      {
        title: "Name Your Server",
        body: 'When prompted for a name, enter a short label such as kubeara or Kubeara MCP, then press Enter.',
      },
      {
        title: "Dismiss the OAuth Popup",
        body: 'VS Code may show a popup saying dynamic client registration is not supported. Click Cancel on that dialog — you may need to cancel twice. This is expected; Kubeara uses a bearer token instead of OAuth.',
      },
      {
        title: "Paste the Kubeara Configuration",
        body: "VS Code opens your mcp.json file. Replace its contents with the configuration below. Replace YOUR_TOKEN_HERE with the token generated on the Kubeara MCP Servers page.",
        configPreset: "vscode",
        note: "Your token is shown only once on the Kubeara dashboard. If you have lost it, go back to the MCP Servers page and generate a new one.",
      },
      {
        title: "Save the File",
        body: "Save mcp.json with Cmd + S (Mac) or Ctrl + S (Windows).",
      },
      {
        title: "Start the MCP Server",
        body: 'Press Ctrl + Shift + P (or Cmd + Shift + P on Mac) again, type "mcp list", and select MCP: List Servers. Choose your Kubeara server from the list and select Start Server.',
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
        issue: "Kubeara not showing in MCP server list",
        fix: "Check that mcp.json is valid JSON and the Authorization header contains your token",
      },
      {
        issue: "Token invalid or rejected",
        fix: "MCP Servers page → revoke old key → generate a new one and update mcp.json",
      },
    ],
    outro:
      "VS Code is now connected to your Kubeara workspace. Your AI assistant can list servers, check GPU metrics, get server status, and more — all from the Copilot chat window.",
    available: true,
  },
  {
    id: "windsurf",
    label: "Windsurf",
    title: "Connecting Kubeara to Windsurf via MCP",
    intro:
      "Connect Windsurf to your Kubeara workspace using the Model Context Protocol. Once set up, Windsurf can read server data, check statuses, and interact with your infrastructure directly from Cascade chat.",
    requirements: [
      "Windsurf desktop app installed on your machine",
      "A Kubeara account with MCP Server enabled",
      "Your Kubeara MCP token — generated from the MCP page",
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
        title: "Add the Kubeara Configuration",
        body: "In the mcpServers section, add the kubeara entry below. If you already have other MCP servers configured, add kubeara alongside them — do not remove your existing entries. Replace YOUR_TOKEN_HERE with the token generated on the Kubeara MCP page.",
        configPreset: "windsurf",
        note: "Your token is shown only once on the Kubeara dashboard. If you have lost it, go back to the MCP page and generate a new one.",
      },
      {
        title: "Save the Configuration",
        body: "Save the configuration file with Cmd + S (Mac) or Ctrl + S (Windows), then return to Windsurf.",
      },
      {
        title: "Verify in MCP Marketplace",
        body: "Go back to MCP Marketplace. You should see Kubeara listed under Installed MCP.",
      },
      {
        title: "Verify the Connection",
        body: "Open a Windsurf Cascade chat. You should see Kubeara available as an MCP server. Ask it anything about your servers — if it responds with your real data, you're all set.",
      },
    ],
    troubleshooting: [
      {
        issue: "Kubeara not showing in MCP Marketplace",
        fix: "Check that the kubeara entry is saved correctly inside mcpServers and the JSON is valid",
      },
      {
        issue: "Token invalid or rejected",
        fix: "MCP page → revoke old key → generate a new one",
      },
    ],
    outro:
      "Windsurf is now connected to your Kubeara workspace. Your AI assistant can list servers, check GPU metrics, get server status, and more — all from the Cascade chat window.",
    available: true,
  },
  {
    id: "antigravity",
    label: "Antigravity",
    title: "Connecting Kubeara to Antigravity via MCP",
    intro:
      "Connect Antigravity to your Kubeara workspace using the Model Context Protocol. Once set up, Antigravity can read server data, check statuses, and interact with your infrastructure directly from the Agent chat.",
    requirements: [
      "Antigravity desktop app installed on your machine",
      "A Kubeara account with MCP Server enabled",
      "Your Kubeara MCP token — generated from the MCP page",
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
        title: "Add the Kubeara Configuration",
        body: "In the mcpServers section, add the kubeara entry below. If you already have other MCP servers configured, add kubeara alongside them — do not remove your existing entries. Replace YOUR_TOKEN_HERE with the token generated on the Kubeara MCP page.",
        configPreset: "antigravity",
        note: "Your token is shown only once on the Kubeara dashboard. If you have lost it, go back to the MCP page and generate a new one.",
      },
      {
        title: "Save the Configuration",
        body: "Save the configuration file with Cmd + S (Mac) or Ctrl + S (Windows), then return to Antigravity.",
      },
      {
        title: "Refresh MCP Servers",
        body: "Go back to MCP Servers and refresh the page. You should see kubeara listed there.",
      },
      {
        title: "Configure Kubeara",
        body: "Click on kubeara in the MCP servers list and complete any setup prompts to enable the connection.",
      },
      {
        title: "Verify the Connection",
        body: "Open an Agent chat in Antigravity. You should see Kubeara available as an MCP server. Ask it anything about your servers — if it responds with your real data, you're all set.",
      },
    ],
    troubleshooting: [
      {
        issue: "Kubeara not showing in MCP servers",
        fix: "Check that the kubeara entry is saved correctly inside mcpServers, refresh the page, and confirm the JSON is valid",
      },
      {
        issue: "Token invalid or rejected",
        fix: "MCP page → revoke old key → generate a new one",
      },
    ],
    outro:
      "Antigravity is now connected to your Kubeara workspace. Your AI assistant can list servers, check GPU metrics, get server status, and more — all from the Agent chat window.",
    available: true,
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    title: "Connecting Kubeara to ChatGPT via MCP",
    intro:
      "Connect ChatGPT to your Kubeara workspace using OAuth. ChatGPT does not support static MCP API keys — you sign in with your Kubeara account when ChatGPT requests access. Desktop clients such as Cursor still use MCP API keys from this page. After connecting, you may need to select Kubeara in each chat before ChatGPT calls your tools — this is normal ChatGPT behavior.",
    requirements: [
      "ChatGPT Business, Enterprise, Edu, or Pro with Developer mode enabled",
      "Workspace admin approval to create and publish MCP plugins (Business/Enterprise/Edu)",
      "A Kubeara account with access to the servers you want ChatGPT to read",
      "Kubeara MCP endpoint reachable over public HTTPS",
    ],
    steps: [
      {
        title: "Open ChatGPT Settings",
        body: "Open ChatGPT in your browser. Click your profile or workspace menu, then open Settings from the bottom of the left sidebar.",
      },
      {
        title: "Go to Plugins",
        body: "In Settings, open the Plugins section. At the bottom of Plugins, turn on Developer mode if it is not already enabled. On Business and Enterprise workspaces, an admin may need to enable this under Workspace settings first.",
      },
      {
        title: "Create a New Plugin",
        body: 'Open Browse plugins. In the top section, click the + (plus) button to add Kubeara. Enter a name you will recognize, such as Kubeara. Add a short description if you want — for example, "Access my Kubeara servers from ChatGPT".',
      },
      {
        title: "Paste the Kubeara MCP URL",
        body: "In the Connection section, find the server URL field. Paste our Kubeara MCP endpoint below.",
        configPreset: "chatgpt",
      },
      {
        title: "Choose OAuth Authentication",
        body: "Under Authentication, select OAuth (not API key). OAuth is required for ChatGPT — Kubeara MCP API keys from this page do not work in ChatGPT.",
      },
      {
        title: "Open Advanced OAuth Settings",
        body: "Click Advanced OAuth settings. A panel opens on the right with OAuth details. After you paste the Kubeara MCP URL, ChatGPT usually auto-fills OAuth fields from Kubeara's discovery metadata.",
      },
      {
        title: "Confirm OAuth Client ID (If Needed)",
        body: "In most cases ChatGPT fills OAuth Client ID automatically. If the field is empty, set it to https://chatgpt.com/ (include the trailing slash). Kubeara accepts ChatGPT's auto-configured client identity or this legacy value.",
        example: "https://chatgpt.com/",
        note: "You do not need a client secret — leave that blank if the field is optional.",
      },
      {
        title: "Confirm and Create the Plugin",
        body: 'Review the settings, click I understand and continue (or the equivalent confirmation), then click Create. ChatGPT may take a moment to register the connector and scan available tools.',
      },
      {
        title: "Sign In with Kubeara",
        body: 'When prompted with Add [your plugin name] to ChatGPT, click Sign in with Kubeara (or the name you chose). ChatGPT opens a new browser window or tab for authorization — keep the ChatGPT tab open while you complete this step.',
      },
      {
        title: "Log In to Kubeara (If Needed)",
        body: "If you are already signed in to Kubeara in that browser, you will go straight to the consent screen. If not, the Kubeara login page opens — enter your Kubeara email and password and click Sign in. You will then be returned to the OAuth authorization page (not the main dashboard).",
        note: "Use your Kubeara console email and password. MCP API keys from this page do not work here.",
      },
      {
        title: "Authorize ChatGPT",
        body: 'On the Connect ChatGPT to Kubeara screen, review the requested access (mcp:read, mcp:write) and click Authorize. This step is required — signing in alone does not finish the connection. The window closes automatically and you are sent back to ChatGPT.',
      },
      {
        title: "Select Kubeara in the Chat",
        body: 'Open a new chat. Click the + button on the left side of the message box. Under plugins or MCP connections, select your Kubeara plugin (the name you chose when creating it, e.g. kubeara). The plugin appears as a chip next to +.',
        note: "ChatGPT does not always call Kubeara tools automatically. If the reply looks generic or does not use your real server data, confirm the Kubeara chip is visible next to + before you send.",
        followUp:
          "Select the plugin again in each new chat, or whenever the Kubeara chip is not shown.",
      },
      {
        title: "Test with a Prompt",
        body: 'With Kubeara selected, ask something like "List my servers in Kubeara." You should see tool usage and data from your workspace.',
      },
    ],
    troubleshooting: [
      {
        issue: "Invalid client ID",
        fix: "Paste the Kubeara MCP URL first and wait for OAuth settings to auto-fill. If Client ID is still empty, set it to https://chatgpt.com/ in Advanced OAuth settings.",
      },
      {
        issue: "Sign-in window keeps loading",
        fix: "Complete the full flow: Sign in → Connect ChatGPT to Kubeara → Authorize. Signing in alone is not enough.",
      },
      {
        issue: "Login fails",
        fix: "Use your Kubeara console email and password. MCP API keys from this page do not work in ChatGPT.",
      },
      {
        issue: "ChatGPT doesn't use Kubeara or gives a generic answer",
        fix: "Click + in the chat input, select your Kubeara plugin, confirm the chip appears next to +, then send your prompt again.",
      },
      {
        issue: "Tools worked before but not in a new chat",
        fix: "Each new chat may require selecting Kubeara again via + in the message box.",
      },
      {
        issue: "Kubeara not listed under +",
        fix: "Go to Settings → Plugins, confirm the plugin exists and OAuth is complete (Sign in → Authorize). Reconnect if needed.",
      },
    ],
    outro:
      "ChatGPT is now connected to Kubeara through OAuth. Your Kubeara user identity controls which servers and metrics ChatGPT can access. In each chat, select your Kubeara plugin from + when you want ChatGPT to use your live server data.",
    available: true,
  },
];

export function getSetupGuideById(id: string): SetupGuide | undefined {
  return SETUP_GUIDES.find((guide) => guide.id === id);
}
