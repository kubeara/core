/** CPU metrics returned by the agent. */
export interface ServerCpuMetricsDto {
  usagePercent: number;
  cores: number;
  loadAverage: [number, number, number];
}

/** Memory metrics returned by the agent (values in bytes). */
export interface ServerMemoryMetricsDto {
  total: number;
  used: number;
  free: number;
  available: number;
  usagePercent: number;
}

/** Root filesystem metrics returned by the agent (values in bytes). */
export interface ServerDiskMetricsDto {
  total: number;
  used: number;
  free: number;
  usagePercent: number;
}

/** Cumulative network I/O returned by the agent (values in bytes). */
export interface ServerNetworkMetricsDto {
  rxBytes: number;
  txBytes: number;
}

/** Host identity and uptime returned by the agent. */
export interface ServerSystemMetricsDto {
  uptime: number;
  hostname: string;
  platform: string;
  architecture: string;
  timestamp: string;
}

/** Full on-demand server resource snapshot for the REST API. */
export interface ServerResourcesResponseDto {
  serverId: string;
  timestamp: string;
  cpu: ServerCpuMetricsDto;
  memory: ServerMemoryMetricsDto;
  disk: ServerDiskMetricsDto;
  network: ServerNetworkMetricsDto;
  system: ServerSystemMetricsDto;
}
