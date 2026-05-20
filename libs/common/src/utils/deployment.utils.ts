import { APP_CONFIG } from '../constants';

/**
 * Masks sensitive values in an environment map.
 * @param environmentMap Key-value map to sanitize.
 * @returns Copy of map with sensitive values replaced by mask.
 */
export function maskEnvMap(environmentMap: Record<string, any>): Record<string, any> {
    try {
        const maskedEnvironmentMap: Record<string, any> = {};
        for (const [key, value] of Object.entries(environmentMap)) {
            const uppercaseKey = key.toUpperCase();
            const isSensitive = APP_CONFIG.SENSITIVE_KEYS.some((sensitiveKey) => uppercaseKey.includes(sensitiveKey));

            if (isSensitive) {
                maskedEnvironmentMap[key] = '******';
            } else {
                maskedEnvironmentMap[key] = value;
            }
        }

        return maskedEnvironmentMap;
    } catch (error) {
        throw new Error(`Failed to mask environment map: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Masks sensitive values in a raw .env file string.
 * @param rawEnvironmentContents Raw .env text content.
 * @returns Sanitized text with sensitive values masked.
 */
export function maskEnvContents(rawEnvironmentContents: string): string {
    try {
        if (!rawEnvironmentContents) return '';
        return rawEnvironmentContents
            .split('\n')
            .map((line) => {
                const separatorIndex = line.indexOf('=');
                if (separatorIndex === -1) return line;
                const uppercaseKey = line.slice(0, separatorIndex).toUpperCase();
                const isSensitive = APP_CONFIG.SENSITIVE_KEYS.some((sensitiveKey) => uppercaseKey.includes(sensitiveKey));

                if (isSensitive) {
                    return `${line.slice(0, separatorIndex + 1)}******`;
                }
                return line;
            })
            .join('\n');
    } catch (error) {
        throw new Error(`Failed to mask environment file contents: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Formats port mappings for display.
 * @param ports Port mapping record.
 * @returns Human-readable representation of port mappings.
 */
export function formatPortMappings(ports: Record<string, number>): string {
    try {
        const portEntries = Object.entries(ports);
        if (portEntries.length === 0) {
            return 'none';
        }
        return portEntries.map(([portKey, portValue]) => `${portKey}=${portValue}`).join(', ');
    } catch (error) {
        throw new Error(`Failed to format port mappings: ${error instanceof Error ? error.message : String(error)}`);
    }
}
