/**
 * Coolify-style public URL / FQDN generation (sslip.io fallback).
 */

export interface ServerUrlContext {
    publicIp: string;
    wildcardDomain?: string | null;
    deploymentId: string;
    forceHttps?: boolean;
}

export interface ParsedServiceEnvVar {
    /** Lowercase service identifier (e.g. n8n) */
    serviceName: string;
    /** Original case from template (e.g. N8N) */
    preservedName: string;
    port: string | null;
    hasPort: boolean;
}

export function parseServiceEnvironmentVariable(key: string): ParsedServiceEnvVar {
    const lastSegment = key.slice(key.lastIndexOf('_') + 1);
    const hasPort = /^\d+$/.test(lastSegment);

    let preservedName = '';
    let serviceName = '';
    let port: string | null = null;

    if (key.startsWith('SERVICE_URL_')) {
        preservedName = hasPort
            ? key.slice('SERVICE_URL_'.length, key.lastIndexOf('_'))
            : key.slice('SERVICE_URL_'.length);
    } else if (key.startsWith('SERVICE_FQDN_')) {
        preservedName = hasPort
            ? key.slice('SERVICE_FQDN_'.length, key.lastIndexOf('_'))
            : key.slice('SERVICE_FQDN_'.length);
    }

    serviceName = preservedName.toLowerCase();

    if (hasPort) {
        port = lastSegment;
    }

    return { serviceName, preservedName, port, hasPort };
}

/** Wildcard base URL when no custom domain is configured (Coolify sslip fallback). */
export function sslipWildcard(publicIp: string): string {
    const ip = publicIp.trim();

    if (!ip || ip === 'localhost' || ip === '127.0.0.1') {
        return 'http://127.0.0.1.sslip.io';
    }

    if (ip.includes(':')) {
        return `http://${ip.replace(/:/g, '-')}.sslip.io`;
    }

    return `http://${ip}.sslip.io`;
}

function resolveWildcardBase(context: ServerUrlContext): URL {
    const raw = context.wildcardDomain?.trim() || sslipWildcard(context.publicIp);
    const normalized = raw.includes('://') ? raw : `http://${raw}`;

    return new URL(normalized);
}

export function buildServiceSubdomain(preservedServiceName: string, deploymentId: string): string {
    const kebab = preservedServiceName.replace(/_/g, '-').toLowerCase();
    const suffix = deploymentId.replace(/^deployment-/, '');

    return `${kebab}-${suffix}`;
}

/** Full URL with scheme (e.g. http://n8n-abc.192.168.1.5.sslip.io). */
export function generateServiceUrl(context: ServerUrlContext, subdomain: string): string {
    const base = resolveWildcardBase(context);
    const scheme = context.forceHttps ? 'https' : base.protocol.replace(':', '');
    const host = base.hostname;
    const path = base.pathname === '/' ? '' : base.pathname;

    return `${scheme}://${subdomain}.${host}${path}`;
}

/** Hostname only, no scheme (e.g. n8n-abc.192.168.1.5.sslip.io). */
export function generateServiceFqdn(context: ServerUrlContext, subdomain: string): string {
    const base = resolveWildcardBase(context);
    const host = `${subdomain}.${base.hostname}`;
    const path = base.pathname === '/' ? '' : base.pathname;

    return `${host}${path}`;
}

/**
 * Generate SERVICE_URL_* and SERVICE_FQDN_* pairs from a template declaration
 * (e.g. SERVICE_URL_N8N_5678 → SERVICE_URL_N8N, SERVICE_FQDN_N8N, …_5678 variants).
 */
export function generateServiceUrlFqdnPairs(
    declarationKey: string,
    context: ServerUrlContext,
): Record<string, string> {
    const parsed = parseServiceEnvironmentVariable(declarationKey);
    const subdomain = buildServiceSubdomain(parsed.preservedName, context.deploymentId);
    const baseUrl = generateServiceUrl(context, subdomain);
    const baseFqdn = generateServiceFqdn(context, subdomain);
    const name = parsed.preservedName;

    const result: Record<string, string> = {
        [`SERVICE_URL_${name}`]: baseUrl,
        [`SERVICE_FQDN_${name}`]: baseFqdn,
    };

    if (parsed.hasPort && parsed.port) {
        result[`SERVICE_URL_${name}_${parsed.port}`] = `${baseUrl}:${parsed.port}`;
        result[`SERVICE_FQDN_${name}_${parsed.port}`] = `${baseFqdn}:${parsed.port}`;
    }

    return result;
}
