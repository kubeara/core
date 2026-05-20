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
    try {
        return generateEnvFileDetails(env, ports).content;
    } catch (error) {
        throw new Error(`Failed to generate env file content: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function generateEnvFileDetails(
    env: EnvFileInput = {},
    ports: PortFileInput = {},
): GeneratedEnvFile {
    try {
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
    } catch (error) {
        throw new Error(`Failed to generate env file details: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Validates an environment variable key for formatting restrictions.
 * @param key Environment variable key to validate.
 */
function validateKey(key: string): void {
    try {
        if (key.trim() === '') {
            throw new Error('Env keys cannot be empty');
        }
        if (/\s/.test(key)) {
            throw new Error(`Env key "${key}" cannot contain spaces`);
        }
    } catch (error) {
        throw new Error(`Invalid env key "${key}": ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Checks whether a value can be safely serialized into .env form.
 * @param value Candidate value.
 * @returns Type-guard for serializable env value types.
 */
function isSerializableEnvValue(value: unknown): value is EnvFileValue {
    try {
        return ['string', 'number', 'boolean'].includes(typeof value);
    } catch (error) {
        throw new Error(`Failed to validate serializable env value: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Serializes env values, quoting only when shell-sensitive characters are present.
 * @param value Env value to serialize.
 * @returns Serialized string representation for .env file output.
 */
function serializeEnvValue(value: EnvFileValue): string {
    try {
        const serializedValue = String(value);
        if (!/[\n\r"'#=\s]/.test(serializedValue)) {
            return serializedValue;
        }

        return JSON.stringify(serializedValue);
    } catch (error) {
        throw new Error(`Failed to serialize env value: ${error instanceof Error ? error.message : String(error)}`);
    }
}
