import { parseServiceEnvironmentVariable } from "../server-url/server-url.util";
import { extractUrlFqdnDeclarations } from "../compose-parser/compose-parser.util";

export const KUBEARA_PROXY_NETWORK = "kubeara-proxy";

const DANGEROUS_PROPERTY_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/** Rejects keys that can alter Object.prototype when used as property names. */
export function isSafePropertyKey(key: string): boolean {
  return key.length > 0 && !DANGEROUS_PROPERTY_KEYS.has(key);
}

function copySafeStringLabels(labels: unknown): Record<string, string> {
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) {
    return {};
  }

  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    labels as Record<string, unknown>,
  )) {
    if (!isSafePropertyKey(key) || typeof value !== "string") {
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

export interface TraefikRouteTarget {
  /** docker-compose service key (e.g. n8n) */
  serviceKey: string;
  host: string;
  internalPort: number;
  routerId: string;
}

export interface BuildTraefikLabelsOptions {
  routerId: string;
  host: string;
  internalPort: number;
  /** Enable HTTPS router + TLS (requires cert resolver on proxy). */
  enableHttps?: boolean;
  /** Redirect HTTP → HTTPS when enableHttps is true. */
  forceHttps?: boolean;
}

/**
 * Minimal Traefik labels for Host-based routing (Coolify-style subset).
 * @param options Router and target service configuration.
 * @returns Traefik label map for docker compose service.
 */
export function buildTraefikLabels(
  options: BuildTraefikLabelsOptions,
): Record<string, string> {
  try {
    const {
      routerId,
      host,
      internalPort,
      enableHttps = false,
      forceHttps = false,
    } = options;
    const safeRouterId = sanitizeRouterId(routerId);

    const labels: Record<string, string> = {
      "traefik.enable": "true",
      "kubeara.managed": "true",
    };

    const httpRouterName = `${safeRouterId}-http`;
    labels[`traefik.http.routers.${httpRouterName}.rule`] = `Host(\`${host}\`)`;
    labels[`traefik.http.routers.${httpRouterName}.entrypoints`] = "http";
    labels[`traefik.http.routers.${httpRouterName}.service`] = httpRouterName;
    labels[`traefik.http.services.${httpRouterName}.loadbalancer.server.port`] =
      String(internalPort);

    if (enableHttps) {
      const httpsRouterName = `${safeRouterId}-https`;
      labels[`traefik.http.routers.${httpsRouterName}.rule`] =
        `Host(\`${host}\`)`;
      labels[`traefik.http.routers.${httpsRouterName}.entrypoints`] = "https";
      labels[`traefik.http.routers.${httpsRouterName}.service`] =
        httpsRouterName;
      labels[
        `traefik.http.services.${httpsRouterName}.loadbalancer.server.port`
      ] = String(internalPort);
      labels[`traefik.http.routers.${httpsRouterName}.tls`] = "true";
      labels[`traefik.http.routers.${httpsRouterName}.tls.certresolver`] =
        "letsencrypt";

      if (forceHttps) {
        labels[
          "traefik.http.middlewares.redirect-to-https.redirectscheme.scheme"
        ] = "https";
        labels[`traefik.http.routers.${httpRouterName}.middlewares`] =
          "redirect-to-https";
      }
    }

    return labels;
  } catch (error) {
    throw new Error(
      `Failed to build Traefik labels: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function sanitizeRouterId(value: string): string {
  try {
    return value
      .replace(/[^a-zA-Z0-9]/g, "-")
      .toLowerCase()
      .slice(0, 48);
  } catch (error) {
    throw new Error(
      `Failed to sanitize router id: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Discover routes from compose URL declarations + resolved env (SERVICE_FQDN_*).
 */
export function discoverTraefikRoutes(
  composeYaml: string,
  env: Record<string, string>,
  deploymentId: string,
): TraefikRouteTarget[] {
  try {
    const routesByService = new Map<string, TraefikRouteTarget>();
    const routerId = sanitizeRouterId(deploymentId);

    for (const declaration of extractUrlFqdnDeclarations(composeYaml)) {
      if (!declaration.startsWith("SERVICE_URL_")) {
        continue;
      }

      const parsedEnvironmentVariable =
        parseServiceEnvironmentVariable(declaration);
      const fqdnKey = parsedEnvironmentVariable.hasPort
        ? `SERVICE_FQDN_${parsedEnvironmentVariable.preservedName}_${parsedEnvironmentVariable.port}`
        : `SERVICE_FQDN_${parsedEnvironmentVariable.preservedName}`;
      const host =
        env[fqdnKey] ??
        env[`SERVICE_FQDN_${parsedEnvironmentVariable.preservedName}`];
      if (!host) {
        continue;
      }

      const internalPort = parsedEnvironmentVariable.port
        ? Number(parsedEnvironmentVariable.port)
        : 80;
      const serviceKey = parsedEnvironmentVariable.serviceName;
      const existingRoute = routesByService.get(serviceKey);

      // Prefer host-only URL (no :port in FQDN) when both SERVICE_URL_N8N and _5678 exist.
      if (existingRoute && parsedEnvironmentVariable.hasPort) {
        continue;
      }
      if (existingRoute && !parsedEnvironmentVariable.hasPort) {
        routesByService.delete(serviceKey);
      }

      routesByService.set(serviceKey, {
        serviceKey,
        host: host
          .replace(/^https?:\/\//, "")
          .split(":")[0]
          .split("/")[0],
        internalPort,
        routerId,
      });
    }

    return Array.from(routesByService.values());
  } catch (error) {
    throw new Error(
      `Failed to discover Traefik routes: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function applyTraefikRoutingToCompose(
  compose: Record<string, unknown>,
  routes: TraefikRouteTarget[],
  options: { enableHttps?: boolean; forceHttps?: boolean } = {},
): Record<string, unknown> {
  try {
    if (routes.length === 0) {
      return compose;
    }

    const services = (compose.services ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    const networks = (compose.networks ?? {}) as Record<string, unknown>;

    networks[KUBEARA_PROXY_NETWORK] = { external: true };

    for (const route of routes) {
      if (!isSafePropertyKey(route.serviceKey)) {
        continue;
      }
      if (!Object.hasOwn(services, route.serviceKey)) {
        continue;
      }

      const service = services[route.serviceKey];
      if (!service || typeof service !== "object" || Array.isArray(service)) {
        continue;
      }

      delete service.ports;

      service.labels = {
        ...copySafeStringLabels(service.labels),
        ...buildTraefikLabels({
          routerId: route.routerId,
          host: route.host,
          internalPort: route.internalPort,
          enableHttps: options.enableHttps,
          forceHttps: options.forceHttps,
        }),
      };

      service.networks = [KUBEARA_PROXY_NETWORK, "default"];
    }

    compose.services = services;
    compose.networks = networks;

    return compose;
  } catch (error) {
    throw new Error(
      `Failed to apply Traefik routing to compose: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
