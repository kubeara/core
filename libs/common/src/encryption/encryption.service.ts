import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as crypto from 'crypto';
import { ENCRYPTION } from './encryption.constants';
import { IEncryptionService } from './interfaces';

@Injectable()
export class EncryptionService implements IEncryptionService {
    private readonly key: Buffer;

    constructor() {
        const secret = process.env[ENCRYPTION.ENV_KEY];
        if (!secret) {
            throw new InternalServerErrorException(
                `Missing encryption secret. Set env ${ENCRYPTION.ENV_KEY}`,
            );
        }

        // Derive 32-byte key using SHA-256 from provided secret (passphrase or base64)
        this.key = crypto.createHash('sha256').update(secret).digest();
    }

    encrypt(data: string): string {
        try {
            const iv = crypto.randomBytes(ENCRYPTION.IV_LENGTH);
            const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
            const enc = Buffer.concat([cipher.update(Buffer.from(data, 'utf8')), cipher.final()]);
            const tag = cipher.getAuthTag();

            // Output: iv|tag|ciphertext, base64 encoded
            return Buffer.concat([iv, tag, enc]).toString('base64');
        } catch (err) {
            throw new InternalServerErrorException('Encryption failed');
        }
    }

    decrypt(data: string): string {
        try {
            const input = Buffer.from(data, 'base64');
            const iv = input.slice(0, ENCRYPTION.IV_LENGTH);
            const tag = input.slice(ENCRYPTION.IV_LENGTH, ENCRYPTION.IV_LENGTH + 16);
            const ciphertext = input.slice(ENCRYPTION.IV_LENGTH + 16);

            const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
            decipher.setAuthTag(tag);
            const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

            return dec.toString('utf8');
        } catch (err) {
            throw new InternalServerErrorException('Decryption failed');
        }
    }
}
