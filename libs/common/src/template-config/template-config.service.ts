import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { NormalizedSchemaField, TemplateSchema } from '@shared/socket-events';
import { ERROR_MESSAGES } from '../constants';

@Injectable()
export class TemplateConfigService {
    private readonly logger = new Logger(TemplateConfigService.name);

    /**
     * Normalizes a template schema into a flat array of fields.
     */
    normalizeSchema(schema: TemplateSchema | null | undefined): NormalizedSchemaField[] {
        if (!schema || typeof schema !== 'object') return [];

        const result: NormalizedSchemaField[] = [];

        // Process environment variables
        if (schema.env_schema) {
            for (const [key, details] of Object.entries(schema.env_schema)) {
                result.push({
                    name: key,
                    section: 'env',
                    type: details.type,
                    required: Boolean(details.required),
                    default: details.default,
                    description: details.description ?? null,
                });
            }
        }

        // Process port mappings
        if (schema.port_schema) {
            for (const [key, details] of Object.entries(schema.port_schema)) {
                result.push({
                    name: key,
                    section: 'ports',
                    type: details.type,
                    required: Boolean(details.required),
                    default: details.default,
                    description: details.description ?? null,
                });
            }
        }

        return result;
    }

    /**
     * Merges user input with schema defaults and validates required fields.
     */
    mergeAndValidate(
        schema: TemplateSchema | undefined,
        userInput: { env?: Record<string, unknown>; ports?: Record<string, unknown> } = {},
    ): { env: Record<string, string>; ports: Record<string, number> } {
        const fields = schema?.normalized && Array.isArray(schema.normalized)
            ? schema.normalized
            : this.normalizeSchema(schema);

        const rawEnv = userInput.env ?? {};
        const rawPorts = userInput.ports ?? {};
        const mergedVariables = { ...rawEnv, ...rawPorts } as Record<string, unknown>;

        const mergedEnv: Record<string, string> = {};
        const mergedPorts: Record<string, number> = {};
        const missing: string[] = [];

        for (const field of fields) {
            const { name, section, required, default: defaultValue, type } = field;
            let value = mergedVariables[name];

            if (required && (value === undefined || value === null || value === '')) {
                missing.push(name);
                continue;
            }

            if ((value === undefined || value === null || value === '') && defaultValue !== undefined) {
                value = defaultValue;
            }

            if (value === undefined || value === null || value === '') {
                continue;
            }

            const castedValue = this.castValue(name, value, type);

            if (section === 'ports' || name.endsWith('_PORT')) {
                mergedPorts[name] = Number(castedValue);
            } else {
                mergedEnv[name] = String(castedValue);
            }
        }

        if (missing.length > 0) {
            throw new BadRequestException(ERROR_MESSAGES.MISSING_REQUIRED_FIELDS(missing.join(', ')));
        }

        return { env: mergedEnv, ports: mergedPorts };
    }

    /**
     * Casts a value to its expected type based on schema.
     */
    private castValue(name: string, value: unknown, type?: string): unknown {
        if (!type) return value;

        switch (type) {
            case 'number':
                const parsedNumber = Number(value);
                if (Number.isNaN(parsedNumber)) {
                    throw new BadRequestException(ERROR_MESSAGES.INVALID_NUMBER(name, value));
                }
                return parsedNumber;

            case 'boolean':
                if (typeof value === 'boolean') return value;
                const s = String(value).toLowerCase();
                if (s === 'true' || s === '1' || value === 1) return true;
                if (s === 'false' || s === '0' || value === 0) return false;
                throw new BadRequestException(ERROR_MESSAGES.INVALID_BOOLEAN(name, value));

            case 'string':
                return String(value);

            default:
                return value;
        }
    }
}