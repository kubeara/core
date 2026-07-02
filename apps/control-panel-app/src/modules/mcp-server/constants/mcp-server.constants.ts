export const MCP_SERVER_NAME = "kubeara-mcp";
export const MCP_SERVER_VERSION = "1.0.0";

export const MCP_JSON_RPC_VERSION = "2.0";

export const MCP_JSON_RPC_NULL_ID = null;

export const MCP_JSON_RPC_ERROR_CODES = {
  METHOD_NOT_ALLOWED: -32_000,
  UNAUTHORIZED: -32_001,
  INTERNAL_ERROR: -32_603,
} as const;

export const MCP_TOOL_NAMES = {
  LIST_SERVERS: "list_servers",
  GET_SERVER_STATUS: "get_server_status",
  GET_GPU_METRICS: "get_gpu_metrics",
  GET_CURRENT_USER: "get_current_user",
} as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[keyof typeof MCP_TOOL_NAMES];

export const MCP_JSON_RPC_METHODS = {
  INITIALIZE: "initialize",
  TOOLS_LIST: "tools/list",
} as const;

export const MCP_UNAUTHENTICATED_METHODS = new Set<string>([
  MCP_JSON_RPC_METHODS.INITIALIZE,
  MCP_JSON_RPC_METHODS.TOOLS_LIST,
]);
