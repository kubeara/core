export type EnvFileValue = string | number | boolean;

export type EnvFileInput = Record<string, EnvFileValue | null | undefined>;

export type PortFileInput = Record<string, number | null | undefined>;

export interface GeneratedEnvFile {
    content: string;
    keys: string[];
    ports: Record<string, number>;
}

export function generateEnvFile(
    env: EnvFileInput = {},
    ports: PortFileInput = {},
): string {
    return generateEnvFileDetails(env, ports).content;
}

export function generateEnvFileDetails(
    env: EnvFileInput = {},
    ports: PortFileInput = {},
): GeneratedEnvFile {
    const lines: string[] = [];
    const keys: string[] = [];
    const resolvedPorts: Record<string, number> = {};

    for (const [key, value] of Object.entries(env)) {
        validateKey(key);
        if (value === undefined || value === null) {
            continue;
        }
        if (!isSerializableEnvValue(value)) {
            throw new Error(`Env value for ${key} must be a string, number, or boolean`);
        }

        keys.push(key);
        lines.push(`${key}=${serializeEnvValue(value)}`);
    }

    for (const [key, value] of Object.entries(ports)) {
        validateKey(key);
        if (value === undefined || value === null) {
            continue;
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error(`Port ${key} must be a finite number`);
        }

        if (value <= 0 || value > 65535 || !Number.isInteger(value)) {
            throw new Error(`Port ${key} must be an integer between 1 and 65535`);
        }

        keys.push(key);
        resolvedPorts[key] = value;
        lines.push(`${key}=${String(value)}`);
    }

    return {
        content: lines.join('\n'),
        keys,
        ports: resolvedPorts,
    };
}

function validateKey(key: string): void {
    if (key.trim() === '') {
        throw new Error('Env keys cannot be empty');
    }
    if (/\s/.test(key)) {
        throw new Error(`Env key "${key}" cannot contain spaces`);
    }
}

function isSerializableEnvValue(value: unknown): value is EnvFileValue {
    return ['string', 'number', 'boolean'].includes(typeof value);
}

function serializeEnvValue(value: EnvFileValue): string {
    const serialized = String(value);
    if (!/[\n\r"'#=\s]/.test(serialized)) {
        return serialized;
    }

    return JSON.stringify(serialized);
}
