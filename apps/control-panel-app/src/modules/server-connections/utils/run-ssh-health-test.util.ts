import { SshHealthCheckService, SshConnectionOptions } from "@shared/ssh";
import { ServerErrorCode } from "../enums/server-error-code.enum";
import { SshHealthTestResult } from "../interfaces/ssh-health-test-result.interface";
import { SSH_TEST_TIMEOUT_MS } from "../constants/server-onboard.constants";
import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { mapSshTestErrorCode } from "./map-ssh-test-error-code.util";

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

function toSshTestFailureResult(err: unknown): SshHealthTestResult {
  const message =
    err instanceof Error ? err.message : ERROR_MESSAGES.SERVER.SSH_TEST_FAILED;

  return {
    success: false,
    latency: 0,
    username: null,
    hostname: null,
    platform: null,
    message,
    code: mapSshTestErrorCode(message),
  };
}

export async function runSshHealthTestWithTimeout(
  health: SshHealthCheckService,
  options: SshConnectionOptions,
  timeoutMs = SSH_TEST_TIMEOUT_MS,
): Promise<SshHealthTestResult> {
  const testPromise = health
    .testConnection(options)
    .catch(toSshTestFailureResult);

  return await Promise.race([
    testPromise,
    new Promise<SshHealthTestResult>((resolve) =>
      setTimeout(() => resolve(createSshTestTimeoutResult()), timeoutMs),
    ),
  ]);
}
