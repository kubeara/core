import { ConfigService } from "@nestjs/config";

import { isProductionEnv } from "@control-panel/constants/env.constant";
import {
  AGENT_INSTALL,
  AGENT_INSTALL_ENV_KEYS,
} from "../constants/agent-install.constants";

/** Official Kubeara agent image published on Docker Hub. */
export const OFFICIAL_DOCKER_HUB_AGENT_IMAGE = AGENT_INSTALL.DEFAULT_IMAGE;

/**
 * Production always uses the official Docker Hub image.
 * Local/development uses KUBEARA_AGENT_IMAGE from the environment when set.
 */
export function resolveAgentInstallImage(configService: ConfigService): string {
  if (isProductionEnv(configService.get<string>("NODE_ENV"))) {
    return OFFICIAL_DOCKER_HUB_AGENT_IMAGE;
  }

  const fromEnv = configService
    .get<string>(AGENT_INSTALL_ENV_KEYS.KUBEARA_AGENT_IMAGE)
    ?.trim();

  return fromEnv || AGENT_INSTALL.DEFAULT_IMAGE;
}

/**
 * Production always pulls from Docker Hub. Local may skip pull for dev images.
 */
export function shouldSkipAgentImagePull(
  configService: ConfigService,
): boolean {
  if (isProductionEnv(configService.get<string>("NODE_ENV"))) {
    return false;
  }

  return configService.get<string>("KUBEARA_AGENT_SKIP_PULL") === "true";
}
