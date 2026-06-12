export const MCP_SERVER_NAME = "kubeara-mcp";
export const MCP_SERVER_VERSION = "1.0.0";

export const MCP_TOOL_NAMES = {
  LIST_SERVERS: "list_servers",
  GET_SERVER_STATUS: "get_server_status",
  GET_GPU_METRICS: "get_gpu_metrics",
  GET_CURRENT_USER: "get_current_user",
} as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[keyof typeof MCP_TOOL_NAMES];

export const MCP_JSON_RPC_METHODS = {
  INITIALIZE: "initialize",
} as const;
