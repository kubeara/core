/**
 * Coolify-style public URL / FQDN generation (sslip.io fallback).
 */

export interface ServerUrlContext {
  publicIp: string;
  wildcardDomain?: string | null;
  deploymentId: string;
  forceHttps?: boolean;
  /** When true, do not publish SERVICE_PORT_* on host (Traefik routes traffic). */
  useTraefik?: boolean;
}

export interface ParsedServiceEnvVar {
  /** Lowercase service identifier (e.g. n8n) */
  serviceName: string;
  /** Original case from template (e.g. N8N) */
  preservedName: string;
  port: string | null;
  hasPort: boolean;
}

export function parseServiceEnvironmentVariable(
  key: string,
): ParsedServiceEnvVar {
  try {
    const lastSegment = key.slice(key.lastIndexOf("_") + 1);
    const hasPort = /^\d+$/.test(lastSegment);

    let preservedName = "";
    let serviceName = "";
    let port: string | null = null;

    if (key.startsWith("SERVICE_URL_")) {
      preservedName = hasPort
        ? key.slice("SERVICE_URL_".length, key.lastIndexOf("_"))
        : key.slice("SERVICE_URL_".length);
    } else if (key.startsWith("SERVICE_FQDN_")) {
      preservedName = hasPort
        ? key.slice("SERVICE_FQDN_".length, key.lastIndexOf("_"))
        : key.slice("SERVICE_FQDN_".length);
    }

    serviceName = preservedName.toLowerCase();

    if (hasPort) {
      port = lastSegment;
    }

    return { serviceName, preservedName, port, hasPort };
  } catch (error) {
    throw new Error(
      `Failed to parse service environment variable "${key}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Wildcard base URL when no custom domain is configured (Coolify sslip fallback). */
export function sslipWildcard(publicIp: string): string {
  try {
    const normalizedIp = publicIp.trim();

    if (
      !normalizedIp ||
      normalizedIp === "localhost" ||
      normalizedIp === "127.0.0.1"
    ) {
      return "http://127.0.0.1.sslip.io";
    }

    if (normalizedIp.includes(":")) {
      return `http://${normalizedIp.replace(/:/g, "-")}.sslip.io`;
    }

    return `http://${normalizedIp}.sslip.io`;
  } catch (error) {
    throw new Error(
      `Failed to compute sslip wildcard from "${publicIp}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Resolves wildcard domain base URL using explicit domain or sslip fallback.
 * @param context URL generation context for deployment.
 * @returns Parsed URL object for downstream host/path extraction.
 */
function resolveWildcardBase(context: ServerUrlContext): URL {
  try {
    const rawDomain =
      context.wildcardDomain?.trim() || sslipWildcard(context.publicIp);
    const normalizedDomain = rawDomain.includes("://")
      ? rawDomain
      : `http://${rawDomain}`;

    return new URL(normalizedDomain);
  } catch (error) {
    throw new Error(
      `Failed to resolve wildcard base URL: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Builds deterministic deployment subdomain from service name and deployment id.
 * @param preservedServiceName Service name token from variable declaration.
 * @param deploymentId Deployment identifier used in URL suffix.
 * @returns Kebab-cased deployment-specific subdomain label.
 */
export function buildServiceSubdomain(
  preservedServiceName: string,
  deploymentId: string,
): string {
  try {
    const kebabServiceName = preservedServiceName
      .replace(/_/g, "-")
      .toLowerCase();
    const deploymentSuffix = deploymentId.replace(/^deployment-/, "");

    return `${kebabServiceName}-${deploymentSuffix}`;
  } catch (error) {
    throw new Error(
      `Failed to build service subdomain: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Full URL with scheme (e.g. http://n8n-abc.192.168.1.5.sslip.io). */
export function generateServiceUrl(
  context: ServerUrlContext,
  subdomain: string,
): string {
  try {
    const wildcardBase = resolveWildcardBase(context);
    const protocol = context.forceHttps
      ? "https"
      : wildcardBase.protocol.replace(":", "");
    const hostName = wildcardBase.hostname;
    const basePath = wildcardBase.pathname === "/" ? "" : wildcardBase.pathname;

    return `${protocol}://${subdomain}.${hostName}${basePath}`;
  } catch (error) {
    throw new Error(
      `Failed to generate service URL for "${subdomain}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Hostname only, no scheme (e.g. n8n-abc.192.168.1.5.sslip.io). */
export function generateServiceFqdn(
  context: ServerUrlContext,
  subdomain: string,
): string {
  try {
    const wildcardBase = resolveWildcardBase(context);
    const hostName = `${subdomain}.${wildcardBase.hostname}`;
    const basePath = wildcardBase.pathname === "/" ? "" : wildcardBase.pathname;

    return `${hostName}${basePath}`;
  } catch (error) {
    throw new Error(
      `Failed to generate service FQDN for "${subdomain}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Generate SERVICE_URL_* and SERVICE_FQDN_* pairs from a template declaration
 * (e.g. SERVICE_URL_N8N_5678 → SERVICE_URL_N8N, SERVICE_FQDN_N8N, …_5678 variants).
 */
export function generateServiceUrlFqdnPairs(
  declarationKey: string,
  context: ServerUrlContext,
): Record<string, string> {
  try {
    const parsedServiceEnvironmentVariable =
      parseServiceEnvironmentVariable(declarationKey);
    const serviceSubdomain = buildServiceSubdomain(
      parsedServiceEnvironmentVariable.preservedName,
      context.deploymentId,
    );
    const generatedBaseUrl = generateServiceUrl(context, serviceSubdomain);
    const generatedBaseFqdn = generateServiceFqdn(context, serviceSubdomain);
    const preservedName = parsedServiceEnvironmentVariable.preservedName;

    const result: Record<string, string> = {
      [`SERVICE_URL_${preservedName}`]: generatedBaseUrl,
      [`SERVICE_FQDN_${preservedName}`]: generatedBaseFqdn,
    };

    if (
      parsedServiceEnvironmentVariable.hasPort &&
      parsedServiceEnvironmentVariable.port &&
      !context.useTraefik
    ) {
      result[
        `SERVICE_URL_${preservedName}_${parsedServiceEnvironmentVariable.port}`
      ] = `${generatedBaseUrl}:${parsedServiceEnvironmentVariable.port}`;
      result[
        `SERVICE_FQDN_${preservedName}_${parsedServiceEnvironmentVariable.port}`
      ] = `${generatedBaseFqdn}:${parsedServiceEnvironmentVariable.port}`;
    }

    return result;
  } catch (error) {
    throw new Error(
      `Failed to generate SERVICE_URL/SERVICE_FQDN pairs: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
