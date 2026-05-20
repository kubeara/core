import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';

const ROOT_DIR = process.cwd();

const ROOT_ENV_PATH = path.join(ROOT_DIR, '.env');

const AGENT_ENV_PATH = path.join(
    ROOT_DIR,
    'apps/agent-app/.env',
);

function validateEnv(): void {
    /**
     * Prevent accidental shared root env usage
     */
    if (fs.existsSync(ROOT_ENV_PATH)) {
        throw new Error(
            [
                '',
                '========================================================================',
                `[FATAL] Root .env file detected at: ${ROOT_ENV_PATH}`,
                'Root level env files are not allowed.',
                'Use only isolated application env files:',
                '  - apps/control-panel-app/.env',
                '  - apps/agent-app/.env',
                '========================================================================',
                '',
            ].join('\n'),
        );
    }

    /**
     * Ensure agent env exists
     */
    if (!fs.existsSync(AGENT_ENV_PATH)) {
        throw new Error(
            [
                '',
                '========================================================================',
                `[FATAL] Missing env file: ${AGENT_ENV_PATH}`,
                'Please create the agent env file before starting the application.',
                '========================================================================',
                '',
            ].join('\n'),
        );
    }

    /**
     * Load agent specific env variables
     */
    dotenv.config({
        path: AGENT_ENV_PATH,
    });

    /**
     * Validate required env keys
     */
    const requiredKeys = [
        'PORT',
        'CONTROL_PANEL_URL',
        'ENCRYPTION_SECRET',
    ] as const;

    const missingKeys = requiredKeys.filter(
        key => !process.env[key],
    );

    if (missingKeys.length > 0) {
        throw new Error(
            [
                '',
                '========================================================================',
                '[FATAL] Missing required environment variables:',
                ...missingKeys.map(key => `  - ${key}`),
                'Please define all required variables in:',
                `  ${AGENT_ENV_PATH}`,
                '========================================================================',
                '',
            ].join('\n'),
        );
    }
}

/**
 * Bootstraps the NestJS agent application after env validation.
 * @returns Promise resolved once server starts listening.
 */
async function bootstrap(): Promise<void> {
    try {
        validateEnv();

    const app = await NestFactory.create(AppModule);

    const configService = app.get(ConfigService);

    const port = Number(
        configService.get<string>('PORT'),
    );

        await app.listen(port);

    console.log(
        `[Agent App] Server running on port ${port}`,
    );
} catch {

}
}

void bootstrap();