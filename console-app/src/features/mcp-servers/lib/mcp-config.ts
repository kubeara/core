import type { SetupGuideConfigPreset } from "../types";

/** Public MCP endpoint shown in setup guides (desktop clients use production). */
export const MCP_SERVER_PUBLIC_URL = "https://api.kubeara.dev/api/mcp";

export function getCursorMcpConfig(): string {
  const mcpUrl = MCP_SERVER_PUBLIC_URL;
  return `{
  "mcpServers": {
    "kubera": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}`;
}

export function getClaudeDesktopMcpConfig(): string {
  const mcpUrl = MCP_SERVER_PUBLIC_URL;
  return `{
  "mcpServers": {
    "kubera": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${mcpUrl}",
        "--transport",
        "http-only",
        "--header",
        "Authorization:\${KUBERA_MCP_TOKEN}"
      ],
      "env": {
        "KUBERA_MCP_TOKEN": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}`;
}

export function getVsCodeMcpConfig(): string {
  const mcpUrl = MCP_SERVER_PUBLIC_URL;
  return `{
  "servers": {
    "kubera": {
      "url": "${mcpUrl}",
      "type": "http",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  },
  "inputs": []
}`;
}

export function getWindsurfMcpConfig(): string {
  return getCursorMcpConfig();
}

export function getAntigravityMcpConfig(): string {
  const mcpUrl = MCP_SERVER_PUBLIC_URL;
  return `{
  "mcpServers": {
    "kubera": {
      "serverUrl": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}`;
}

export function getMcpConfigForPreset(preset: SetupGuideConfigPreset): string {
  if (preset === "claude-desktop") {
    return getClaudeDesktopMcpConfig();
  }
  if (preset === "vscode") {
    return getVsCodeMcpConfig();
  }
  if (preset === "windsurf") {
    return getWindsurfMcpConfig();
  }
  if (preset === "antigravity") {
    return getAntigravityMcpConfig();
  }
  return getCursorMcpConfig();
}

export function getMcpConfigLabel(preset: SetupGuideConfigPreset): string {
  if (preset === "claude-desktop") {
    return "claude_desktop_config.json";
  }
  if (preset === "vscode") {
    return "mcp.json";
  }
  if (preset === "windsurf") {
    return "mcp_config.json";
  }
  if (preset === "antigravity") {
    return "mcp_config.json";
  }
  return "mcp.json";
}

/** @deprecated Use getCursorMcpConfig instead */
export function getMcpJsonConfig(): string {
  return getCursorMcpConfig();
}
