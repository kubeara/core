import { ServiceUnavailableException } from '@nestjs/common';

export class SshConnectionError extends ServiceUnavailableException {
    constructor(message?: string) {
        super(message ?? 'SSH connection error');
    }
}
