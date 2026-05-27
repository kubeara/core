import { SshHealthCheckService, SshConnectionOptions } from "@shared/ssh";
import { ServerErrorCode } from "../enums/server-error-code.enum";
import { SshHealthTestResult } from "../interfaces/ssh-health-test-result.interface";
import { SSH_TEST_TIMEOUT_MS } from "../constants/server-onboard.constants";
import { ERROR_MESSAGES } from "@control-panel/constants/error";

export function createSshTestTimeoutResult(): SshHealthTestResult {
  return {
    success: false,
    latency: 0,
    username: null,
    hostname: null,
    platform: null,
    message: ERROR_MESSAGES.SERVER.CONNECTION_TIMEOUT,
    code: ServerErrorCode.CONNECTION_TIMEOUT,
  };
}

export async function runSshHealthTestWithTimeout(
  health: SshHealthCheckService,
  options: SshConnectionOptions,
  timeoutMs = SSH_TEST_TIMEOUT_MS,
): Promise<SshHealthTestResult> {
  const testPromise = health.testConnection(options);

  return await Promise.race([
    testPromise,
    new Promise<SshHealthTestResult>((resolve) =>
      setTimeout(() => resolve(createSshTestTimeoutResult()), timeoutMs),
    ),
  ]);
}
