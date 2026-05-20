import { randomBytes } from 'crypto';

import {
    generateServiceUrlFqdnPairs,
    parseServiceEnvironmentVariable,
    ServerUrlContext,
} from '../server-url/server-url.util';

/**
 * Coolify-inspired compose environment parsing:
 * - Discover ${VAR} and ${VAR:-default} placeholders in compose YAML
 * - Auto-generate SERVICE_* magic variables (PASSWORD, USER, BASE64, …)
 * - Auto-generate SERVICE_URL_* / SERVICE_FQDN_* when serverUrlContext is provided
 * - Merge with caller-provided env / ports (user values win)
 */

export type { ServerUrlContext };

export interface ComposeVariableRef {
    name: string;
    defaultValue?: string;
}

export interface ResolveComposeEnvOptions {
    compose: string;
    userEnv?: Record<string, unknown>;
    userPorts?: Record<string, unknown>;
    /** Keys from template port_schema (e.g. SERVICE_PORT_POSTGRES) */
    portSchemaKeys?: string[];
    /** When set, auto-generate SERVICE_URL_* / SERVICE_FQDN_* via sslip.io (Coolify-style). */
    serverUrlContext?: ServerUrlContext;
}

export interface ResolvedComposeEnv {
    env: Record<string, string>;
    ports: Record<string, number>;
    generatedKeys: string[];
}

const MAGIC_PREFIX = 'SERVICE_';
const PORT_KEY_PREFIX = 'SERVICE_PORT_';

/**
 * Extract variable names (and optional defaults) from a compose YAML string.
 */
export function extractComposeVariables(compose: string): ComposeVariableRef[] {
    const byName = new Map<string, ComposeVariableRef>();

    const patterns: RegExp[] = [
        /\$\{([^}]+)\}/g,
        /(?<!\$)\$([A-Za-z_][A-Za-z0-9_]*)/g,
    ];

    for (const pattern of patterns) {
        for (const match of compose.matchAll(pattern)) {
            const raw = match[1] ?? match[2];
            if (!raw) {
                continue;
            }

            const parsed = parsePlaceholderContent(raw.trim());
            if (!parsed.name) {
                continue;
            }

            const existing = byName.get(parsed.name);
            if (!existing) {
                byName.set(parsed.name, parsed);
            } else if (!existing.defaultValue && parsed.defaultValue) {
                existing.defaultValue = parsed.defaultValue;
            }
        }
    }

    return Array.from(byName.values());
}

/**
 * Bare SERVICE_URL_* / SERVICE_FQDN_* declarations in compose environment lists
 * (e.g. `- SERVICE_URL_N8N_5678` with no value).
 */
export function extractUrlFqdnDeclarations(compose: string): string[] {
    const names = new Set<string>();
    const patterns = [
        /^\s*-\s*(SERVICE_(?:URL|FQDN)_[A-Za-z0-9_]+)\s*$/gm,
        /^\s*(SERVICE_(?:URL|FQDN)_[A-Za-z0-9_]+):\s*['"]?['"]?\s*$/gm,
    ];

    for (const pattern of patterns) {
        for (const match of compose.matchAll(pattern)) {
            if (match[1]) {
                names.add(match[1]);
            }
        }
    }

    return Array.from(names);
}

function applyServerUrlFqdnGeneration(
    compose: string,
    env: Record<string, string>,
    ports: Record<string, number>,
    generatedKeys: string[],
    serverUrlContext: ServerUrlContext,
): void {
    const declarations = extractUrlFqdnDeclarations(compose);
    const processed = new Set<string>();

    for (const declaration of declarations) {
        if (!declaration.startsWith('SERVICE_URL_')) {
            continue;
        }

        const parsed = parseServiceEnvironmentVariable(declaration);
        const groupKey = `${parsed.serviceName}:${parsed.port ?? 'base'}`;

        if (processed.has(groupKey)) {
            continue;
        }

        processed.add(groupKey);

        const pairs = generateServiceUrlFqdnPairs(declaration, serverUrlContext);

        for (const [key, value] of Object.entries(pairs)) {
            if (env[key] === undefined) {
                env[key] = value;
                generatedKeys.push(key);
            }
        }

        if (parsed.hasPort && parsed.port) {
            const portKey = `SERVICE_PORT_${parsed.preservedName}`;
            if (ports[portKey] === undefined && !serverUrlContext?.useTraefik) {
                ports[portKey] = Number(parsed.port);
                generatedKeys.push(portKey);
            }
        }
    }
}

function parsePlaceholderContent(content: string): ComposeVariableRef {
    const split = splitOnDefaultOperator(content);
    if (split) {
        return { name: split.variable.trim(), defaultValue: split.default };
    }

    return { name: content.trim() };
}

/**
 * Split on :- or - at depth 0 (no nested ${} in template defaults today).
 */
function splitOnDefaultOperator(content: string): { variable: string; default: string } | null {
    const operators = [':-', '-'] as const;

    for (const op of operators) {
        const index = content.indexOf(op);
        if (index > 0) {
            return {
                variable: content.slice(0, index),
                default: content.slice(index + op.length),
            };
        }
    }

    return null;
}

/**
 * Parse SERVICE_{COMMAND}_{IDENTIFIER} into a generation command (Coolify-style).
 */
export function parseMagicEnvCommand(key: string): string | null {
    if (!key.startsWith(MAGIC_PREFIX)) {
        return null;
    }

    const underscoreCount = (key.match(/_/g) ?? []).length;

    if (underscoreCount === 2) {
        if (
            key.startsWith('SERVICE_FQDN') ||
            key.startsWith('SERVICE_URL') ||
            key.startsWith(PORT_KEY_PREFIX)
        ) {
            if (key.startsWith(PORT_KEY_PREFIX)) {
                return 'PORT';
            }

            return key.slice('SERVICE_'.length, key.lastIndexOf('_'));
        }

        return key.slice('SERVICE_'.length, key.lastIndexOf('_'));
    }

    if (underscoreCount === 3) {
        if (key.startsWith('SERVICE_FQDN') || key.startsWith('SERVICE_URL')) {
            return key.slice('SERVICE_'.length, key.indexOf('_', 'SERVICE_'.length));
        }

        return key.slice('SERVICE_'.length, key.lastIndexOf('_'));
    }

    return null;
}

export function isPortVariable(name: string, portSchemaKeys: string[] = []): boolean {
    if (portSchemaKeys.includes(name)) {
        return true;
    }

    // Host port mappings use SERVICE_PORT_* only (not app env vars like N8N_RUNNERS_BROKER_PORT).
    return name.startsWith(PORT_KEY_PREFIX);
}

/**
 * Generate a value for a SERVICE_* magic variable command.
 */
export function generateMagicEnvValue(command: string): string {
    switch (command) {
        case 'PASSWORD':
            return randomAlphanumeric(24);
        case 'PASSWORD_64':
            return randomAlphanumeric(64);
        case 'PASSWORDWITHSYMBOLS':
            return randomPassword(24, true);
        case 'PASSWORDWITHSYMBOLS_64':
            return randomPassword(64, true);
        case 'BASE64':
        case 'BASE64_32':
            return randomAlphanumeric(32);
        case 'BASE64_64':
            return randomAlphanumeric(64);
        case 'BASE64_128':
            return randomAlphanumeric(128);
        case 'USER':
            return randomAlphanumeric(16);
        case 'LOWERCASEUSER':
            return randomAlphanumeric(16).toLowerCase();
        case 'HEX_32':
            return randomHex(16);
        case 'HEX_64':
            return randomHex(32);
        case 'HEX_128':
            return randomHex(64);
        default:
            return randomAlphanumeric(32);
    }
}

export function resolveComposeEnvironment(options: ResolveComposeEnvOptions): ResolvedComposeEnv {
    const {
        compose,
        userEnv: rawUserEnv = {},
        userPorts: rawUserPorts = {},
        portSchemaKeys = [],
        serverUrlContext,
    } = options;

    const userEnv = { ...rawUserEnv };
    const userPorts = { ...rawUserPorts };

    // Allow port variables in either `ports` or `env` request fields
    for (const [key, value] of Object.entries(userEnv)) {
        if (isPortVariable(key, portSchemaKeys) && userPorts[key] === undefined) {
            userPorts[key] = value;
        }
    }

    const extracted = extractComposeVariables(compose);
    const env: Record<string, string> = {};
    const ports: Record<string, number> = {};
    const generatedKeys: string[] = [];

    for (const [key, value] of Object.entries(userEnv)) {
        if (value !== undefined && value !== null && value !== '') {
            env[key] = String(value);
        }
    }

    for (const [key, value] of Object.entries(userPorts)) {
        if (value !== undefined && value !== null && value !== '') {
            const parsed = Number(value);
            if (!Number.isNaN(parsed)) {
                ports[key] = parsed;
            }
        }
    }

    for (const variable of extracted) {
        const { name, defaultValue } = variable;

        if (isPortVariable(name, portSchemaKeys)) {
            if (ports[name] !== undefined) {
                continue;
            }

            if (defaultValue !== undefined && defaultValue !== '') {
                const parsed = Number(defaultValue);
                if (!Number.isNaN(parsed)) {
                    ports[name] = parsed;
                }
            }

            continue;
        }

        if (env[name] !== undefined) {
            continue;
        }

        const magicCommand = parseMagicEnvCommand(name);
        if (magicCommand && magicCommand !== 'PORT' && magicCommand !== 'FQDN' && magicCommand !== 'URL') {
            env[name] = generateMagicEnvValue(magicCommand);
            generatedKeys.push(name);
            continue;
        }

        if (
            serverUrlContext &&
            (magicCommand === 'FQDN' || magicCommand === 'URL') &&
            env[name] === undefined
        ) {
            continue;
        }

        if (defaultValue !== undefined) {
            env[name] = defaultValue;
        }
    }

    if (serverUrlContext) {
        applyServerUrlFqdnGeneration(compose, env, ports, generatedKeys, serverUrlContext);
    }

    if (serverUrlContext?.useTraefik) {
        for (const key of Object.keys(ports)) {
            if (isPortVariable(key, portSchemaKeys)) {
                delete ports[key];
            }
        }
    }

    return { env, ports, generatedKeys };
}

/**
 * Variables the caller must supply (no compose default, not auto-generated magic).
 */
export function inferRequiredComposeVariables(
    compose: string,
    options: { serverUrlContext?: ServerUrlContext } = {},
): string[] {
    const required: string[] = [];

    for (const { name, defaultValue } of extractComposeVariables(compose)) {
        if (defaultValue !== undefined && defaultValue !== '') {
            continue;
        }

        const magicCommand = parseMagicEnvCommand(name);
        if (magicCommand && magicCommand !== 'PORT' && magicCommand !== 'FQDN' && magicCommand !== 'URL') {
            continue;
        }

        if (options.serverUrlContext && (magicCommand === 'FQDN' || magicCommand === 'URL')) {
            continue;
        }

        required.push(name);
    }

    return required;
}

/**
 * Port placeholder names declared in compose (e.g. SERVICE_PORT_POSTGRES).
 */
export function listComposePortVariables(compose: string): string[] {
    return extractComposeVariables(compose)
        .filter((variable) => isPortVariable(variable.name))
        .map((variable) => variable.name);
}

/**
 * Port keys sent by the caller that do not exist in the compose template.
 */
export function findUnknownPortKeys(
    compose: string,
    userPorts: Record<string, unknown>,
): string[] {
    const known = new Set(listComposePortVariables(compose));

    return Object.keys(userPorts).filter((key) => !known.has(key));
}

/**
 * Returns compose placeholder names that remain unresolved after parsing.
 */
export function findMissingComposeVariables(
    compose: string,
    resolved: ResolvedComposeEnv,
    options: { serverUrlContext?: ServerUrlContext } = {},
): string[] {
    const merged: Record<string, string | number> = { ...resolved.env, ...resolved.ports };
    const missing: string[] = [];

    for (const { name } of extractComposeVariables(compose)) {
        if (options.serverUrlContext?.useTraefik && isPortVariable(name)) {
            continue;
        }

        const value = merged[name];
        if (value !== undefined && value !== null && value !== '') {
            continue;
        }

        missing.push(name);
    }

    return missing;
}

export function resolveAndValidateComposeEnvironment(
    options: ResolveComposeEnvOptions,
): ResolvedComposeEnv {
    const resolved = resolveComposeEnvironment(options);
    const missing = findMissingComposeVariables(options.compose, resolved, {
        serverUrlContext: options.serverUrlContext,
    });

    if (missing.length > 0) {
        throw new Error(`Missing required compose variables: ${missing.join(', ')}`);
    }

    return resolved;
}

function randomAlphanumeric(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = randomBytes(length);

    return Array.from(bytes, (byte) => chars[byte % chars.length]).join('');
}

function randomHex(byteLength: number): string {
    return randomBytes(byteLength).toString('hex');
}

function randomPassword(length: number, withSymbols: boolean): string {
    let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    if (withSymbols) {
        chars += '!@#$%^&*';
    }

    const bytes = randomBytes(length);

    return Array.from(bytes, (byte) => chars[byte % chars.length]).join('');
}
