import {
    extractComposeVariables,
    findMissingComposeVariables,
    listComposePortVariables,
    resolveAndValidateComposeEnvironment,
    resolveComposeEnvironment,
} from '@shared/common';

const yaml = require('js-yaml') as {
    load(input: string): unknown;
};

export interface TemplateComposeValidationOptions {
    /** Maximum allowed CPU cores per service (limits.cpus). */
    maxCpuCores?: number;
    /** Maximum allowed memory per service in bytes (limits.memory). */
    maxMemoryBytes?: number;
    /** Maximum allowed log file size in bytes (logging.options.max-size). */
    maxLogFileSizeBytes?: number;
    /** Maximum allowed rotated log file count. */
    maxLogFileCount?: number;
    /** Required logging max-size when logging limits are enforced. */
    requiredLogMaxSize?: string;
    /** Required logging max-file when logging limits are enforced. */
    requiredLogMaxFiles?: number;
    requireHealthcheck?: boolean;
    requireResourceLimits?: boolean;
    requireLoggingLimits?: boolean;
    requireRestartPolicy?: boolean;
}

export interface TemplateValidationIssue {
    path: string;
    message: string;
}

export interface TemplateComposeFileContext {
    slug: string;
    composePath: string;
    composeYaml: string;
    hasTemplateConfig: boolean;
    portSchemaKeys?: string[];
    requiredEnvSchemaKeys?: string[];
}

export interface TemplateValidationResult {
    slug: string;
    composePath: string;
    valid: boolean;
    issues: TemplateValidationIssue[];
}

export const DEFAULT_TEMPLATE_COMPOSE_POLICY: Required<TemplateComposeValidationOptions> = {
    maxCpuCores: 2,
    maxMemoryBytes: 2 * 1024 * 1024 * 1024,
    maxLogFileSizeBytes: 50 * 1024 * 1024,
    maxLogFileCount: 10,
    requiredLogMaxSize: '10m',
    requiredLogMaxFiles: 3,
    requireHealthcheck: true,
    requireResourceLimits: true,
    requireLoggingLimits: true,
    requireRestartPolicy: true,
};

/**
 * Validates a service template docker-compose.yml against Kubeara template rules.
 */
export function validateTemplateComposeFile(
    context: TemplateComposeFileContext,
    options: TemplateComposeValidationOptions = {},
): TemplateValidationResult {
    const policy = { ...DEFAULT_TEMPLATE_COMPOSE_POLICY, ...options };
    const issues: TemplateValidationIssue[] = [];

    let parsed: Record<string, unknown> | undefined;

    try {
        const loaded = yaml.load(context.composeYaml);
        if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) {
            issues.push({
                path: 'root',
                message: 'Compose YAML must resolve to an object',
            });
        } else {
            parsed = loaded as Record<string, unknown>;
        }
    } catch (error: unknown) {
        issues.push({
            path: 'root',
            message: `Invalid YAML syntax: ${error instanceof Error ? error.message : String(error)}`,
        });
    }

    if (!parsed) {
        return buildResult(context, issues);
    }

    validateComposeStructure(parsed, issues);
    validateHeaderMetadata(context.composeYaml, issues);
    validateServices(parsed, policy, context, issues);
    validateSchemaPortKeysInCompose(context, issues);
    validateEnvironmentRules(context, issues);

    return buildResult(context, issues);
}

function buildResult(
    context: TemplateComposeFileContext,
    issues: TemplateValidationIssue[],
): TemplateValidationResult {
    return {
        slug: context.slug,
        composePath: context.composePath,
        valid: issues.length === 0,
        issues,
    };
}

function validateComposeStructure(parsed: Record<string, unknown>, issues: TemplateValidationIssue[]): void {
    const services = parsed.services;

    if (!services || typeof services !== 'object' || Array.isArray(services)) {
        issues.push({
            path: 'services',
            message: 'Compose file must define a non-empty services map',
        });
        return;
    }

    if (Object.keys(services as Record<string, unknown>).length === 0) {
        issues.push({
            path: 'services',
            message: 'Compose file must define at least one service',
        });
    }
}

function validateHeaderMetadata(composeYaml: string, issues: TemplateValidationIssue[]): void {
    const headerLines = composeYaml.split('\n').filter((line) => line.startsWith('#'));

    const hasPortHint = headerLines.some((line) => /^#\s*port\s*:/i.test(line));
    const hasDocumentation = headerLines.some((line) => /^#\s*documentation\s*:/i.test(line));

    if (!hasPortHint) {
        issues.push({
            path: 'header.port',
            message: 'Template header must include a `# port: <number>` comment',
        });
    }

    if (!hasDocumentation) {
        issues.push({
            path: 'header.documentation',
            message: 'Template header must include a `# documentation: <url>` comment',
        });
    }
}

function validateServices(
    parsed: Record<string, unknown>,
    policy: Required<TemplateComposeValidationOptions>,
    context: TemplateComposeFileContext,
    issues: TemplateValidationIssue[],
): void {
    const services = parsed.services as Record<string, Record<string, unknown>>;

    for (const [serviceName, service] of Object.entries(services)) {
        const basePath = `services.${serviceName}`;

        if (!service || typeof service !== 'object') {
            issues.push({ path: basePath, message: 'Service definition must be an object' });
            continue;
        }

        validateServiceImage(service, basePath, issues);

        if (policy.requireRestartPolicy && !hasNonEmptyString(service.restart)) {
            issues.push({
                path: `${basePath}.restart`,
                message: 'Service must define a restart policy (e.g. unless-stopped)',
            });
        }

        validateServicePortMappings(serviceName, service, context, issues);

        if (policy.requireHealthcheck) {
            validateHealthcheck(service.healthcheck, `${basePath}.healthcheck`, issues);
        }

        if (policy.requireResourceLimits) {
            validateResourceLimits(
                service.deploy,
                `${basePath}.deploy.resources`,
                policy,
                issues,
            );
        }

        if (policy.requireLoggingLimits) {
            validateLoggingLimits(service.logging, `${basePath}.logging`, policy, issues);
        }
    }

    validateTemplateHasExposedEndpoint(services, context, issues);
}

/**
 * Returns service names defined in a parsed compose document.
 */
export function listComposeServiceNames(parsed: Record<string, unknown>): string[] {
    const services = parsed.services;

    if (!services || typeof services !== 'object' || Array.isArray(services)) {
        return [];
    }

    return Object.keys(services as Record<string, unknown>).sort();
}

function getServicePortMappingText(service: Record<string, unknown>): string {
    const ports = service.ports;

    if (!Array.isArray(ports) || ports.length === 0) {
        return '';
    }

    return ports.map((entry) => String(entry)).join(' ');
}

function serviceExposesHostEndpoint(service: Record<string, unknown>): boolean {
    if (hasTraefikRouting(service)) {
        return true;
    }

    const portText = getServicePortMappingText(service);

    if (!portText) {
        return false;
    }

    return listComposePortVariables(portText).length > 0 || extractComposeVariables(portText).length > 0;
}

/**
 * Validates port mappings for a single service when it publishes host ports.
 * Internal services without a ports block are allowed (e.g. sidecars).
 */
function validateServicePortMappings(
    serviceName: string,
    service: Record<string, unknown>,
    context: TemplateComposeFileContext,
    issues: TemplateValidationIssue[],
): void {
    const basePath = `services.${serviceName}.ports`;
    const portText = getServicePortMappingText(service);

    if (!portText) {
        return;
    }

    if (context.hasTemplateConfig) {
        const schemaKeys = context.portSchemaKeys ?? [];
        const usesSchemaKey = schemaKeys.some(
            (key) => portText.includes(`\${${key}`) || portText.includes(`$${key}`),
        );
        const usesServicePort = listComposePortVariables(portText).length > 0;

        if (!usesSchemaKey && !usesServicePort) {
            issues.push({
                path: basePath,
                message:
                    'Published port mappings must reference port_schema keys or SERVICE_PORT_* variables',
            });
        }

        return;
    }

    const portVars = extractComposeVariables(portText).map((entry) => entry.name);
    const servicePortVars = portVars.filter((name) => name.startsWith('SERVICE_PORT_'));

    if (servicePortVars.length === 0) {
        issues.push({
            path: basePath,
            message: 'Published port mappings must use SERVICE_PORT_* variables (compose-only templates)',
        });
    }

    for (const name of portVars) {
        if (name.startsWith('SERVICE_PORT_')) {
            continue;
        }

        if (/PORT/i.test(name)) {
            issues.push({
                path: `${basePath}.${name}`,
                message: `Host port variable "${name}" must use the SERVICE_PORT_* prefix`,
            });
        }
    }
}

function schemaPortsDeclaredInCompose(context: TemplateComposeFileContext): boolean {
    const schemaPortKeys = context.portSchemaKeys ?? [];

    return (
        context.hasTemplateConfig &&
        schemaPortKeys.length > 0 &&
        schemaPortKeys.every(
            (portKey) =>
                context.composeYaml.includes(`\${${portKey}`) || context.composeYaml.includes(`$${portKey}`),
        )
    );
}

/**
 * Ensures the template exposes at least one reachable endpoint across its services.
 */
function validateTemplateHasExposedEndpoint(
    services: Record<string, Record<string, unknown>>,
    context: TemplateComposeFileContext,
    issues: TemplateValidationIssue[],
): void {
    const anyServiceExposes = Object.values(services).some((service) => serviceExposesHostEndpoint(service));

    if (!anyServiceExposes && !schemaPortsDeclaredInCompose(context)) {
        issues.push({
            path: 'services',
            message:
                'Template must expose at least one host port (SERVICE_PORT_* or port_schema) or Traefik routing on a service',
        });
    }
}

function validateServiceImage(
    service: Record<string, unknown>,
    basePath: string,
    issues: TemplateValidationIssue[],
): void {
    const image = service.image;

    if (typeof image !== 'string' || image.trim().length === 0) {
        issues.push({
            path: `${basePath}.image`,
            message: 'Service must define a non-empty image',
        });
        return;
    }

    if (image.includes('${') && !/\$\{[^}]+\}/.test(image)) {
        issues.push({
            path: `${basePath}.image`,
            message: 'Service image placeholder is malformed',
        });
    }
}

function validateHealthcheck(
    healthcheck: unknown,
    path: string,
    issues: TemplateValidationIssue[],
): void {
    if (!healthcheck || typeof healthcheck !== 'object' || Array.isArray(healthcheck)) {
        issues.push({ path, message: 'Service must define a healthcheck block' });
        return;
    }

    const block = healthcheck as Record<string, unknown>;

    if (!block.test) {
        issues.push({ path: `${path}.test`, message: 'Healthcheck must define a test command' });
    }

    for (const key of ['interval', 'timeout', 'retries'] as const) {
        if (block[key] === undefined || block[key] === null || block[key] === '') {
            issues.push({
                path: `${path}.${key}`,
                message: `Healthcheck must define ${key}`,
            });
        }
    }
}

function validateResourceLimits(
    deploy: unknown,
    path: string,
    policy: Required<TemplateComposeValidationOptions>,
    issues: TemplateValidationIssue[],
): void {
    if (!deploy || typeof deploy !== 'object' || Array.isArray(deploy)) {
        issues.push({ path, message: 'Service must define deploy.resources.limits (cpu and memory)' });
        return;
    }

    const resources = (deploy as Record<string, unknown>).resources;
    if (!resources || typeof resources !== 'object' || Array.isArray(resources)) {
        issues.push({ path, message: 'Service must define deploy.resources.limits (cpu and memory)' });
        return;
    }

    const limits = (resources as Record<string, unknown>).limits;
    if (!limits || typeof limits !== 'object' || Array.isArray(limits)) {
        issues.push({ path: `${path}.limits`, message: 'Service must define deploy.resources.limits' });
        return;
    }

    const limitBlock = limits as Record<string, unknown>;
    const cpu = limitBlock.cpus ?? limitBlock.cpu;
    const memory = limitBlock.memory;

    if (cpu === undefined || cpu === null || cpu === '') {
        issues.push({ path: `${path}.limits.cpus`, message: 'Resource limit cpus is required' });
    } else {
        const cpuCores = parseCpuToCores(String(cpu));
        if (cpuCores === null) {
            issues.push({ path: `${path}.limits.cpus`, message: `Invalid cpu limit value: ${cpu}` });
        } else if (cpuCores > policy.maxCpuCores) {
            issues.push({
                path: `${path}.limits.cpus`,
                message: `Cpu limit ${cpu} exceeds platform maximum of ${policy.maxCpuCores} cores`,
            });
        }
    }

    if (memory === undefined || memory === null || memory === '') {
        issues.push({ path: `${path}.limits.memory`, message: 'Resource limit memory is required' });
    } else {
        const memoryBytes = parseMemoryToBytes(String(memory));
        if (memoryBytes === null) {
            issues.push({ path: `${path}.limits.memory`, message: `Invalid memory limit value: ${memory}` });
        } else if (memoryBytes > policy.maxMemoryBytes) {
            issues.push({
                path: `${path}.limits.memory`,
                message: `Memory limit ${memory} exceeds platform maximum of ${formatBytes(policy.maxMemoryBytes)}`,
            });
        }
    }
}

function validateLoggingLimits(
    logging: unknown,
    path: string,
    policy: Required<TemplateComposeValidationOptions>,
    issues: TemplateValidationIssue[],
): void {
    if (!logging || typeof logging !== 'object' || Array.isArray(logging)) {
        issues.push({
            path,
            message: 'Service must define logging.options.max-size and logging.options.max-file',
        });
        return;
    }

    const block = logging as Record<string, unknown>;
    const options = block.options;

    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        issues.push({
            path: `${path}.options`,
            message: 'Service must define logging.options.max-size and logging.options.max-file',
        });
        return;
    }

    const optionBlock = options as Record<string, unknown>;
    const maxSize = optionBlock['max-size'];
    const maxFile = optionBlock['max-file'];

    if (maxSize === undefined || maxSize === null || maxSize === '') {
        issues.push({ path: `${path}.options.max-size`, message: 'logging.options.max-size is required' });
    } else {
        const sizeBytes = parseMemoryToBytes(String(maxSize));
        if (sizeBytes === null) {
            issues.push({
                path: `${path}.options.max-size`,
                message: `Invalid logging max-size value: ${maxSize}`,
            });
        } else if (sizeBytes > policy.maxLogFileSizeBytes) {
            issues.push({
                path: `${path}.options.max-size`,
                message: `logging max-size ${maxSize} exceeds platform maximum of ${formatBytes(policy.maxLogFileSizeBytes)}`,
            });
        }
    }

    if (maxFile === undefined || maxFile === null || maxFile === '') {
        issues.push({ path: `${path}.options.max-file`, message: 'logging.options.max-file is required' });
    } else {
        const count = Number(maxFile);
        if (!Number.isFinite(count) || count <= 0) {
            issues.push({
                path: `${path}.options.max-file`,
                message: `Invalid logging max-file value: ${maxFile}`,
            });
        } else if (count > policy.maxLogFileCount) {
            issues.push({
                path: `${path}.options.max-file`,
                message: `logging max-file ${count} exceeds platform maximum of ${policy.maxLogFileCount}`,
            });
        }
    }
}

function validateSchemaPortKeysInCompose(
    context: TemplateComposeFileContext,
    issues: TemplateValidationIssue[],
): void {
    if (!context.hasTemplateConfig) {
        return;
    }

    const schemaPortKeys = context.portSchemaKeys ?? [];

    for (const portKey of schemaPortKeys) {
        if (!context.composeYaml.includes(`\${${portKey}`) && !context.composeYaml.includes(`$${portKey}`)) {
            issues.push({
                path: `port_schema.${portKey}`,
                message: `port_schema key "${portKey}" must appear as a placeholder in docker-compose.yml`,
            });
        }
    }
}

function validateEnvironmentRules(
    context: TemplateComposeFileContext,
    issues: TemplateValidationIssue[],
): void {
    const composeVars = extractComposeVariables(context.composeYaml).map((entry) => entry.name);
    const invalidBareDollar = composeVars.filter((name) => !/^[A-Z][A-Z0-9_]*$/.test(name));

    for (const name of invalidBareDollar) {
        issues.push({
            path: `environment.${name}`,
            message: `Environment variable "${name}" must use uppercase snake_case`,
        });
    }

    if (context.hasTemplateConfig && context.requiredEnvSchemaKeys) {
        for (const envKey of context.requiredEnvSchemaKeys) {
            const appearsInCompose =
                context.composeYaml.includes(`\${${envKey}`) ||
                context.composeYaml.includes(`$${envKey}`) ||
                context.composeYaml.includes(`${envKey}:`);

            if (!appearsInCompose) {
                issues.push({
                    path: `env_schema.${envKey}`,
                    message: `Required env_schema key "${envKey}" must be referenced in docker-compose.yml`,
                });
            }
        }
    }

    if (context.hasTemplateConfig) {
        return;
    }

    try {
        const samplePorts = Object.fromEntries(
            listComposePortVariables(context.composeYaml).map((key) => [key, 18000]),
        );

        resolveAndValidateComposeEnvironment({
            compose: context.composeYaml,
            userPorts: samplePorts,
            portSchemaKeys: context.portSchemaKeys ?? [],
            serverUrlContext: context.composeYaml.includes('SERVICE_URL_')
                ? {
                      deploymentId: 'deployment-test-123',
                      publicIp: '127.0.0.1',
                      useTraefik: true,
                  }
                : undefined,
        });
    } catch (error: unknown) {
        issues.push({
            path: 'environment',
            message: `Compose environment resolution failed: ${error instanceof Error ? error.message : String(error)}`,
        });
    }

    const resolved = resolveComposeEnvironment({
        compose: context.composeYaml,
        userPorts: Object.fromEntries(
            listComposePortVariables(context.composeYaml).map((key) => [key, 18000]),
        ),
        portSchemaKeys: context.portSchemaKeys ?? [],
    });

    const missingWithoutContext = findMissingComposeVariables(context.composeYaml, resolved).filter(
        (name) => !name.startsWith('SERVICE_URL_') && !name.startsWith('SERVICE_FQDN_'),
    );

    if (missingWithoutContext.length > 0) {
        issues.push({
            path: 'environment',
            message: `Missing resolvable compose variables without serverUrlContext: ${missingWithoutContext.join(', ')}`,
        });
    }
}

function hasTraefikRouting(service: Record<string, unknown>): boolean {
    const labels = service.labels;
    if (!labels || typeof labels !== 'object') {
        return false;
    }

    return Object.keys(labels as Record<string, unknown>).some((key) => key.startsWith('traefik.'));
}

function hasNonEmptyString(value: unknown): boolean {
    return typeof value === 'string' && value.trim().length > 0;
}

export function parseMemoryToBytes(value: string): number | null {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d+(?:\.\d+)?)([bkmg]?(?:b|i?b)?)?$/i);

    if (!match) {
        return null;
    }

    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) {
        return null;
    }

    const unit = (match[2] ?? 'b').toLowerCase();

    if (unit === 'b' || unit === '') {
        return amount;
    }
    if (unit === 'k' || unit === 'kb' || unit === 'kib') {
        return amount * 1024;
    }
    if (unit === 'm' || unit === 'mb' || unit === 'mib') {
        return amount * 1024 * 1024;
    }
    if (unit === 'g' || unit === 'gb' || unit === 'gib') {
        return amount * 1024 * 1024 * 1024;
    }

    return null;
}

export function parseCpuToCores(value: string): number | null {
    const trimmed = value.trim().toLowerCase();

    if (trimmed.endsWith('m')) {
        const millis = Number(trimmed.slice(0, -1));
        return Number.isFinite(millis) ? millis / 1000 : null;
    }

    const cores = Number(trimmed);
    return Number.isFinite(cores) ? cores : null;
}

function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
        return `${bytes / (1024 * 1024 * 1024)}G`;
    }
    if (bytes >= 1024 * 1024) {
        return `${bytes / (1024 * 1024)}M`;
    }
    return `${bytes}B`;
}
