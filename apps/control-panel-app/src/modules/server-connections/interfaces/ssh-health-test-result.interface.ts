export interface SshHealthTestResult {
  success: boolean;
  latency: number;
  username: string | null;
  hostname: string | null;
  platform: string | null;
  message: string;
  code?: string;
}
