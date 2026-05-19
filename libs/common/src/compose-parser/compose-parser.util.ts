import { randomBytes } from 'crypto';

/**
 * Coolify-inspired compose environment parsing:
 * - Discover ${VAR} and ${VAR:-default} placeholders in compose YAML
 * - Auto-generate SERVICE_* magic variables (PASSWORD, USER, BASE64, …)
 * - Merge with caller-provided env / ports (user values win)
 */

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

    return name.startsWith(PORT_KEY_PREFIX) || name.endsWith('_PORT');
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
        userEnv = {},
        userPorts = {},
        portSchemaKeys = [],
    } = options;

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

        if (defaultValue !== undefined) {
            env[name] = defaultValue;
        }
    }

    return { env, ports, generatedKeys };
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
