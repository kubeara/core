import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { NormalizedSchemaField, TemplateSchema } from '@shared/socket-events';
import { ERROR_MESSAGES } from '../constants';

@Injectable()
export class TemplateConfigService {
    private readonly logger = new Logger(TemplateConfigService.name);

    /**
     * Normalizes a template schema into a flat array of fields.
     * @param schema Raw template schema from persistence.
     * @returns Flattened and section-aware field descriptors.
     */
    normalizeSchema(schema: TemplateSchema | null | undefined): NormalizedSchemaField[] {
        try {
            if (!schema || typeof schema !== 'object') return [];

            const normalizedFields: NormalizedSchemaField[] = [];

            // Process environment variables
            if (schema.env_schema) {
                for (const [fieldName, fieldDetails] of Object.entries(schema.env_schema)) {
                    normalizedFields.push({
                        name: fieldName,
                        section: 'env',
                        type: fieldDetails.type,
                        required: Boolean(fieldDetails.required),
                        default: fieldDetails.default,
                        description: fieldDetails.description ?? null,
                    });
                }
            }

            // Process port mappings
            if (schema.port_schema) {
                for (const [fieldName, fieldDetails] of Object.entries(schema.port_schema)) {
                    normalizedFields.push({
                        name: fieldName,
                        section: 'ports',
                        type: fieldDetails.type,
                        required: Boolean(fieldDetails.required),
                        default: fieldDetails.default,
                        description: fieldDetails.description ?? null,
                    });
                }
            }

            return normalizedFields;
        } catch (error) {
            this.logger.error(`Failed to normalize template schema: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Merges user input with schema defaults and validates required fields.
     * @param schema Template schema with normalized field metadata.
     * @param userInput Input values from env and ports sections.
     * @returns Fully validated env and port maps.
     */
    mergeAndValidate(
        schema: TemplateSchema | undefined,
        userInput: { env?: Record<string, unknown>; ports?: Record<string, unknown> } = {},
    ): { env: Record<string, string>; ports: Record<string, number> } {
        try {
            const fields = schema?.normalized && Array.isArray(schema.normalized)
                ? schema.normalized
                : this.normalizeSchema(schema);

            const rawEnv = userInput.env ?? {};
            const rawPorts = userInput.ports ?? {};
            const mergedVariables = { ...rawEnv, ...rawPorts } as Record<string, unknown>;

            const mergedEnv: Record<string, string> = {};
            const mergedPorts: Record<string, number> = {};
            const missingFields: string[] = [];

            for (const field of fields) {
                const { name, section, required, default: defaultValue, type } = field;
                let fieldValue = mergedVariables[name];

                if (required && (fieldValue === undefined || fieldValue === null || fieldValue === '')) {
                    missingFields.push(name);
                    continue;
                }

                if ((fieldValue === undefined || fieldValue === null || fieldValue === '') && defaultValue !== undefined) {
                    fieldValue = defaultValue;
                }

                if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
                    continue;
                }

                const castedValue = this.castValue(name, fieldValue, type);

                if (section === 'ports' || name.endsWith('_PORT')) {
                    mergedPorts[name] = Number(castedValue);
                } else {
                    mergedEnv[name] = String(castedValue);
                }
            }

            if (missingFields.length > 0) {
                throw new BadRequestException(ERROR_MESSAGES.MISSING_REQUIRED_FIELDS(missingFields.join(', ')));
            }

            return { env: mergedEnv, ports: mergedPorts };
        } catch (error) {
            this.logger.error(`Failed to merge and validate template config: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Casts a value to its expected type based on schema.
     * @param name Field name being cast.
     * @param value Input value to cast.
     * @param type Expected schema type.
     * @returns Casted value preserving schema intent.
     */
    private castValue(name: string, value: unknown, type?: string): unknown {
        try {
            if (!type) return value;

            switch (type) {
                case 'number': {
                    const parsedNumber = Number(value);
                    if (Number.isNaN(parsedNumber)) {
                        throw new BadRequestException(ERROR_MESSAGES.INVALID_NUMBER(name, value));
                    }
                    return parsedNumber;
                }
                case 'boolean': {
                    if (typeof value === 'boolean') return value;
                    const normalizedValue = String(value).toLowerCase();
                    if (normalizedValue === 'true' || normalizedValue === '1' || value === 1) return true;
                    if (normalizedValue === 'false' || normalizedValue === '0' || value === 0) return false;
                    throw new BadRequestException(ERROR_MESSAGES.INVALID_BOOLEAN(name, value));
                }
                case 'string':
                    return String(value);
                default:
                    return value;
            }
        } catch (error) {
            this.logger.error(`Failed to cast value for ${name}: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}