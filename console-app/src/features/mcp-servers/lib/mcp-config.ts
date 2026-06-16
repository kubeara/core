import { getApiBaseUrl } from "@/lib/api-config";
import type { SetupGuideConfigPreset } from "../types";

export function getMcpServerUrl(): string {
  return `${getApiBaseUrl()}/mcp`;
}

export function getCursorMcpConfig(): string {
  const mcpUrl = getMcpServerUrl();
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
  const mcpUrl = getMcpServerUrl();
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

export function getWindsurfMcpConfig(): string {
  return getCursorMcpConfig();
}

export function getAntigravityMcpConfig(): string {
  const mcpUrl = getMcpServerUrl();
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
