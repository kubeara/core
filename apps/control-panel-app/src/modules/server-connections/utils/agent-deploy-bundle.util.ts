import * as fs from "fs";
import * as path from "path";

import { AGENT_INSTALL } from "../constants/agent-install.constants";

/**
 * Resolves the directory containing docker-compose.agent.yml for remote provisioning.
 */
export function resolveAgentDeployBundleDir(): string {
  const fromEnv = process.env.KUBEARA_AGENT_DEPLOY_DIR?.trim();
  if (fromEnv) {
    const composePath = path.join(fromEnv, AGENT_INSTALL.COMPOSE_FILE);
    if (fs.existsSync(composePath)) {
      return fromEnv;
    }
  }

  const candidates = [
    path.join(process.cwd(), "apps/control-panel-app/deploy"),
    path.join(process.cwd(), "deploy"),
    path.join(__dirname, "../../../../deploy"),
    path.join(__dirname, "../../../../../deploy"),
  ];

  for (const dir of candidates) {
    const composePath = path.join(dir, AGENT_INSTALL.COMPOSE_FILE);
    if (fs.existsSync(composePath)) {
      return dir;
    }
  }

  throw new Error(
    `Agent deploy bundle not found (missing ${AGENT_INSTALL.COMPOSE_FILE}). ` +
      "Set KUBEARA_AGENT_DEPLOY_DIR or ensure apps/control-panel-app/deploy is packaged in the image.",
  );
}

export function readAgentComposeFile(): string {
  const bundleDir = resolveAgentDeployBundleDir();
  return fs.readFileSync(
    path.join(bundleDir, AGENT_INSTALL.COMPOSE_FILE),
    "utf8",
  );
}

/**
 * Resolves apps/control-panel-app/scripts (bundled next to deploy in images).
 */
export function resolveAgentScriptsDir(): string {
  const candidates = [
    path.join(process.cwd(), "apps/control-panel-app/scripts"),
    path.join(process.cwd(), "scripts"),
    path.join(__dirname, "../../../../scripts"),
    path.join(__dirname, "../../../../../scripts"),
  ];

  for (const dir of candidates) {
    const scriptPath = path.join(dir, AGENT_INSTALL.PREREQ_SCRIPT);
    if (fs.existsSync(scriptPath)) {
      return dir;
    }
  }

  throw new Error(
    `Agent prerequisite script not found (missing ${AGENT_INSTALL.PREREQ_SCRIPT}). ` +
      "Ensure apps/control-panel-app/scripts is packaged in the image.",
  );
}

export function readAgentPrereqScript(): string {
  return fs.readFileSync(
    path.join(resolveAgentScriptsDir(), AGENT_INSTALL.PREREQ_SCRIPT),
    "utf8",
  );
}
