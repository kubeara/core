import { UnauthorizedException } from '@nestjs/common';

export class SshAuthenticationError extends UnauthorizedException {
    constructor(message?: string) {
        super(message ?? 'SSH authentication failed');
    }
}
