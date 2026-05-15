import { Injectable } from '@nestjs/common';

type ComposeJson = Record<string, unknown>;

@Injectable()
export class TemplatePayloadService {
    decodeBase64ToObject(encoded: string): ComposeJson {
        try {
            const decoded = Buffer.from(encoded, 'base64').toString('utf8');
            const parsed = JSON.parse(decoded) as unknown;

            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('Compose payload must be a JSON object');
            }

            return parsed as ComposeJson;
        } catch (err) {
            throw new Error('Invalid encoded compose payload');
        }
    }

    encodeObjectToBase64(obj: unknown): string {
        try {
            const json = JSON.stringify(obj);
            return Buffer.from(json, 'utf8').toString('base64');
        } catch (err) {
            throw new Error('Failed to encode compose payload');
        }
    }
}
