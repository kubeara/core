export interface McpServerListItem {
  name: string;
  ip: string;
  status: string;
  gpu: string | null;
}

export interface McpServerStatus {
  name: string;
  status: string;
  uptime: string;
  cpu: string;
  ram: string;
  disk: string;
}

export interface McpServerDeployResult {
  success: boolean;
  message: string;
  port: number;
  status: string;
}

export interface McpServerGpuMetrics {
  server: string;
  gpu: string;
  utilization: string;
  vramUsed: string;
  vramTotal: string;
  temp: string;
}
