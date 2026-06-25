import * as yaml from "js-yaml";

export interface ComposeResourceRequirements {
  memoryBytes: number;
  cpuCores: number;
}

interface ComposeDeployResources {
  limits?: {
    cpus?: string | number;
    memory?: string | number;
  };
}

interface ComposeServiceWithDeploy {
  deploy?: {
    resources?: ComposeDeployResources;
  };
}

interface ComposeFileWithServices {
  services?: Record<string, ComposeServiceWithDeploy>;
}

const MEMORY_UNIT_MULTIPLIERS: Record<string, number> = {
  b: 1,
  k: 1024,
  m: 1024 ** 2,
  g: 1024 ** 3,
  t: 1024 ** 4,
  ki: 1024,
  mi: 1024 ** 2,
  gi: 1024 ** 3,
  ti: 1024 ** 4,
};

/**
 * Parses a Docker memory limit string into bytes.
 */
export function parseMemoryLimitToBytes(value: string | number): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid memory limit: ${value}`);
    }

    return value;
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error("Invalid memory limit: empty value");
  }

  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/i);
  if (!match) {
    throw new Error(`Invalid memory limit: ${value}`);
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid memory limit: ${value}`);
  }

  const unit = (match[2] ?? "b").toLowerCase();
  const multiplier = MEMORY_UNIT_MULTIPLIERS[unit];
  if (!multiplier) {
    throw new Error(`Invalid memory limit unit: ${value}`);
  }

  return Math.round(amount * multiplier);
}

/**
 * Parses a Docker CPU limit into logical core count.
 */
export function parseCpuLimitToCores(value: string | number): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid CPU limit: ${value}`);
    }

    return value;
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error("Invalid CPU limit: empty value");
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid CPU limit: ${value}`);
  }

  return parsed;
}

/**
 * Sums `deploy.resources.limits` across all services in a compose object.
 */
export function sumComposeResourceLimits(
  compose: unknown,
): ComposeResourceRequirements {
  if (!compose || typeof compose !== "object" || Array.isArray(compose)) {
    return { memoryBytes: 0, cpuCores: 0 };
  }

  const services = (compose as ComposeFileWithServices).services;
  if (!services || typeof services !== "object") {
    return { memoryBytes: 0, cpuCores: 0 };
  }

  let memoryBytes = 0;
  let cpuCores = 0;

  for (const service of Object.values(services)) {
    const limits = service?.deploy?.resources?.limits;
    if (!limits) {
      continue;
    }

    if (limits.memory !== undefined) {
      memoryBytes += parseMemoryLimitToBytes(limits.memory);
    }

    if (limits.cpus !== undefined) {
      cpuCores += parseCpuLimitToCores(limits.cpus);
    }
  }

  return { memoryBytes, cpuCores };
}

/**
 * Parses compose YAML and returns total resource limits for all services.
 */
export function sumComposeResourceLimitsFromYaml(
  composeYaml: string,
): ComposeResourceRequirements {
  const parsed = yaml.load(composeYaml);
  return sumComposeResourceLimits(parsed);
}
