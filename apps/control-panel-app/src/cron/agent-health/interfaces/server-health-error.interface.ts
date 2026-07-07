export interface ServerHealthError {
  message: string;
  timestamp: number;
  details?: Record<string, unknown>;
}
