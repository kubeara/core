import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

/**
 * Validates required environment files and keys before bootstrapping the agent app.
 * @throws Error when environment file placement or required keys are invalid.
 */
function validateEnv(): void {
    try {
        const rootDirectory = process.cwd();
        const rootEnvPath = path.join(rootDirectory, '.env');

        // Prevent accidental use of root .env
        if (fs.existsSync(rootEnvPath) && fs.existsSync(path.join(rootDirectory, 'apps')) && fs.existsSync(path.join(rootDirectory, 'package.json'))) {
            throw new Error(
                `\n========================================================================\n` +
                `[FATAL] Accidental root .env file detected at: ${rootEnvPath}\n` +
                `To ensure secure isolation and prevent env leakage, you must delete the root .env file\n` +
                `and use app-specific env files inside the respective application folders:\n` +
                `  - Control Panel: apps/control-panel-app/.env\n` +
                `  - Agent:         apps/agent-app/.env\n` +
                `========================================================================\n`
            );
        }

        let applicationEnvPath = path.join(rootDirectory, 'apps/agent-app/.env');
        if (!fs.existsSync(applicationEnvPath)) {
            if (fs.existsSync(path.join(rootDirectory, '.env')) && !fs.existsSync(path.join(rootDirectory, 'apps'))) {
                applicationEnvPath = path.join(rootDirectory, '.env');
            }
        }

        const isDockerRuntime = process.env.NODE_ENV === 'production' || process.env.CONTROL_PANEL_URL === 'http://control-panel-app:3000';

        if (!isDockerRuntime && !fs.existsSync(applicationEnvPath)) {
            throw new Error(
                `\n========================================================================\n` +
                `[FATAL] Required env file is missing at: ${applicationEnvPath}\n` +
                `Please copy apps/agent-app/.env.example to apps/agent-app/.env\n` +
                `and set the necessary configuration values.\n` +
                `========================================================================\n`
            );
        }

        // Load the app-specific environment variables
        if (fs.existsSync(applicationEnvPath)) {
            dotenv.config({ path: applicationEnvPath });
        }

        // Validate required env keys
        const requiredKeys = ['PORT', 'CONTROL_PANEL_URL', 'ENCRYPTION_SECRET'];
        const missingKeys = requiredKeys.filter((key) => !process.env[key]);
        if (missingKeys.length > 0) {
            throw new Error(
                `\n========================================================================\n` +
                `[FATAL] Missing required environment variables in apps/agent-app/.env:\n` +
                `  ${missingKeys.join(', ')}\n` +
                `Please ensure these are defined in your env file.\n` +
                `========================================================================\n`
            );
        }
    } catch (error) {
        throw new Error(`Agent environment validation failed: ${error instanceof Error ? error.message : String(error)}`);
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
        const port = Number(configService.get<string>('PORT', '3001'));

        await app.listen(port);

        console.log(`[Agent App] Server running on port ${port}`);
    } catch (error) {
        console.error(`[Agent App] Bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

void bootstrap();
