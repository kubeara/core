import { parseServiceEnvironmentVariable } from '../server-url/server-url.util';
import { extractUrlFqdnDeclarations } from '../compose-parser/compose-parser.util';

export const KUBEARA_PROXY_NETWORK = 'kubeara-proxy';

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
 */
export function buildTraefikLabels(options: BuildTraefikLabelsOptions): Record<string, string> {
    const { routerId, host, internalPort, enableHttps = false, forceHttps = false } = options;
    const safeId = sanitizeRouterId(routerId);

    const labels: Record<string, string> = {
        'traefik.enable': 'true',
        'kubeara.managed': 'true',
    };

    const httpRouter = `${safeId}-http`;
    labels[`traefik.http.routers.${httpRouter}.rule`] = `Host(\`${host}\`)`;
    labels[`traefik.http.routers.${httpRouter}.entrypoints`] = 'http';
    labels[`traefik.http.routers.${httpRouter}.service`] = httpRouter;
    labels[`traefik.http.services.${httpRouter}.loadbalancer.server.port`] = String(internalPort);

    if (enableHttps) {
        const httpsRouter = `${safeId}-https`;
        labels[`traefik.http.routers.${httpsRouter}.rule`] = `Host(\`${host}\`)`;
        labels[`traefik.http.routers.${httpsRouter}.entrypoints`] = 'https';
        labels[`traefik.http.routers.${httpsRouter}.service`] = httpsRouter;
        labels[`traefik.http.services.${httpsRouter}.loadbalancer.server.port`] = String(internalPort);
        labels[`traefik.http.routers.${httpsRouter}.tls`] = 'true';
        labels[`traefik.http.routers.${httpsRouter}.tls.certresolver`] = 'letsencrypt';

        if (forceHttps) {
            labels['traefik.http.middlewares.redirect-to-https.redirectscheme.scheme'] = 'https';
            labels[`traefik.http.routers.${httpRouter}.middlewares`] = 'redirect-to-https';
        }
    }

    return labels;
}

export function sanitizeRouterId(value: string): string {
    return value.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 48);
}

/**
 * Discover routes from compose URL declarations + resolved env (SERVICE_FQDN_*).
 */
export function discoverTraefikRoutes(
    composeYaml: string,
    env: Record<string, string>,
    deploymentId: string,
): TraefikRouteTarget[] {
    const routesByService = new Map<string, TraefikRouteTarget>();
    const routerId = sanitizeRouterId(deploymentId);

    for (const declaration of extractUrlFqdnDeclarations(composeYaml)) {
        if (!declaration.startsWith('SERVICE_URL_')) {
            continue;
        }

        const parsed = parseServiceEnvironmentVariable(declaration);
        const fqdnKey = parsed.hasPort
            ? `SERVICE_FQDN_${parsed.preservedName}_${parsed.port}`
            : `SERVICE_FQDN_${parsed.preservedName}`;
        const host = env[fqdnKey] ?? env[`SERVICE_FQDN_${parsed.preservedName}`];
        if (!host) {
            continue;
        }

        const internalPort = parsed.port ? Number(parsed.port) : 80;
        const serviceKey = parsed.serviceName;
        const existing = routesByService.get(serviceKey);

        // Prefer host-only URL (no :port in FQDN) when both SERVICE_URL_N8N and _5678 exist.
        if (existing && parsed.hasPort) {
            continue;
        }
        if (existing && !parsed.hasPort) {
            routesByService.delete(serviceKey);
        }

        routesByService.set(serviceKey, {
            serviceKey,
            host: host.replace(/^https?:\/\//, '').split(':')[0].split('/')[0],
            internalPort,
            routerId,
        });
    }

    return Array.from(routesByService.values());
}

export function applyTraefikRoutingToCompose(
    compose: Record<string, unknown>,
    routes: TraefikRouteTarget[],
    options: { enableHttps?: boolean; forceHttps?: boolean } = {},
): Record<string, unknown> {
    if (routes.length === 0) {
        return compose;
    }

    const services = (compose.services ?? {}) as Record<string, Record<string, unknown>>;
    const networks = (compose.networks ?? {}) as Record<string, unknown>;

    networks[KUBEARA_PROXY_NETWORK] = { external: true };

    for (const route of routes) {
        const service = services[route.serviceKey];
        if (!service) {
            continue;
        }

        delete service.ports;

        const existingLabels = (service.labels ?? {}) as Record<string, string>;
        service.labels = {
            ...existingLabels,
            ...buildTraefikLabels({
                routerId: route.routerId,
                host: route.host,
                internalPort: route.internalPort,
                enableHttps: options.enableHttps,
                forceHttps: options.forceHttps,
            }),
        };

        service.networks = [KUBEARA_PROXY_NETWORK, 'default'];
    }

    compose.services = services;
    compose.networks = networks;

    return compose;
}
