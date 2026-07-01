import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { toErrorMessage } from "@control-panel/common/utils/error.util";
import {
  AGENT_HEALTH,
  AGENT_HEALTH_ENV_KEYS,
} from "../constants/agent-health.constants";

const DISABLED_VALUES = new Set(["false", "0", "no", "off"]);
const logger = new Logger("AgentHealthCronConfig");

/**
 * Checks if the agent health cron is enabled.
 * @param configService - The config service to use.
 * @returns True if the agent health cron is enabled, false otherwise.
 */
export function isAgentHealthCronEnabled(
  configService: ConfigService,
): boolean {
  try {
    const raw = configService
      .get<string>(AGENT_HEALTH_ENV_KEYS.CRON_ENABLED)
      ?.trim()
      .toLowerCase();

    if (!raw) {
      return true;
    }

    return !DISABLED_VALUES.has(raw);
  } catch (error) {
    logger.error(
      `${AGENT_HEALTH.LOG_PREFIX} Failed to resolve ${AGENT_HEALTH_ENV_KEYS.CRON_ENABLED}: ${toErrorMessage(error)}`,
    );
    return true;
  }
}

/**
 * Resolves the agent health cron interval in milliseconds.
 * @param configService - The config service to use.
 * @returns The agent health cron interval in milliseconds.
 */
export function resolveAgentHealthCronIntervalMs(
  configService: ConfigService,
): number {
  try {
    const raw = configService
      .get<string>(AGENT_HEALTH_ENV_KEYS.CRON_INTERVAL_MS)
      ?.trim();

    if (!raw) {
      return AGENT_HEALTH.CRON_INTERVAL_MS;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return AGENT_HEALTH.CRON_INTERVAL_MS;
    }

    return parsed;
  } catch (error) {
    logger.error(
      `${AGENT_HEALTH.LOG_PREFIX} Failed to resolve ${AGENT_HEALTH_ENV_KEYS.CRON_INTERVAL_MS}: ${toErrorMessage(error)}`,
    );
    return AGENT_HEALTH.CRON_INTERVAL_MS;
  }
}
