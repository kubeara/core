import { Injectable } from '@nestjs/common';

const yaml = require('js-yaml') as {
    dump(
        input: unknown,
        options?: {
            lineWidth?: number;
            noRefs?: boolean;
        },
    ): string;
};

type ComposeJson = Record<string, unknown>;

@Injectable()
export class TemplatePayloadService {
    /**
     * Decodes a base64-encoded json compose payload into yaml text.
     * @param encoded Base64 encoded json compose object.
     * @returns YAML string for docker compose processing.
     */
    decodeBase64ToYaml(encoded: string): string {
        try {
            return yaml.dump(this.decodeBase64ToObject(encoded), {
                lineWidth: -1,
                noRefs: true,
            });
        } catch (error) {
            throw new Error(`Failed to decode base64 payload to yaml: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Decodes and validates a base64 payload as a plain json object.
     * @param encoded Base64 encoded json string.
     * @returns Parsed compose object.
     */
    decodeBase64ToObject(encoded: string): ComposeJson {
        try {
            const decoded = Buffer.from(encoded, 'base64').toString('utf8');
            const parsed = JSON.parse(decoded) as unknown;

            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('Compose payload must be a JSON object');
            }

            return parsed as ComposeJson;
        } catch (error) {
            throw new Error(`Invalid encoded compose payload: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Encodes a json-serializable object into base64.
     * @param payload Object to serialize and encode.
     * @returns Base64 encoded json text.
     */
    encodeObjectToBase64(payload: unknown): string {
        try {
            const json = JSON.stringify(payload);
            return Buffer.from(json, 'utf8').toString('base64');
        } catch (error) {
            throw new Error(`Failed to encode compose payload: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
