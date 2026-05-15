import { APP_CONFIG } from '../constants';

/**
 * Masks sensitive values in an environment map.
 */
export function maskEnvMap(map: Record<string, any>): Record<string, any> {
    const masked: Record<string, any> = {};
    for (const [key, value] of Object.entries(map)) {
        const upKey = key.toUpperCase();
        const isSensitive = APP_CONFIG.SENSITIVE_KEYS.some(k => upKey.includes(k));
        
        if (isSensitive) {
            masked[key] = '******';
        } else {
            masked[key] = value;
        }
    }
    return masked;
}

/**
 * Masks sensitive values in a raw .env file string.
 */
export function maskEnvContents(raw: string): string {
    if (!raw) return '';
    return raw
        .split('\n')
        .map((line) => {
            const idx = line.indexOf('=');
            if (idx === -1) return line;
            const key = line.slice(0, idx).toUpperCase();
            const isSensitive = APP_CONFIG.SENSITIVE_KEYS.some(k => key.includes(k));
            
            if (isSensitive) {
                return `${line.slice(0, idx + 1)}******`;
            }
            return line;
        })
        .join('\n');
}

/**
 * Formats port mappings for display.
 */
export function formatPortMappings(ports: Record<string, number>): string {
    const entries = Object.entries(ports);
    if (entries.length === 0) {
        return 'none';
    }
    return entries.map(([key, value]) => `${key}=${value}`).join(', ');
}
