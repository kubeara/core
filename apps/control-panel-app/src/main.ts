import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

/**
 * Validates control-panel environment files and required runtime keys.
 * @throws Error when env file strategy or required keys are invalid.
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

        let appEnvPath = path.join(rootDirectory, 'apps/control-panel-app/.env');
        if (!fs.existsSync(appEnvPath)) {
            if (fs.existsSync(path.join(rootDirectory, '.env')) && !fs.existsSync(path.join(rootDirectory, 'apps'))) {
                appEnvPath = path.join(rootDirectory, '.env');
            }
        }

        const isDockerRuntime = process.env.NODE_ENV === 'production' || process.env.DB_HOST === 'postgres';

        if (!isDockerRuntime && !fs.existsSync(appEnvPath)) {
            throw new Error(
                `\n========================================================================\n` +
                `[FATAL] Required env file is missing at: ${appEnvPath}\n` +
                `Please copy apps/control-panel-app/.env.example to apps/control-panel-app/.env\n` +
                `and set the necessary configuration values.\n` +
                `========================================================================\n`
            );
        }

        // Load the app-specific environment variables
        if (fs.existsSync(appEnvPath)) {
            dotenv.config({ path: appEnvPath });
        }

        // Validate required env keys
        const requiredKeys = ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE', 'PORT', 'ENCRYPTION_SECRET'];
        const missingKeys = requiredKeys.filter((key) => !process.env[key]);
        if (missingKeys.length > 0) {
            throw new Error(
                `\n========================================================================\n` +
                `[FATAL] Missing required environment variables in apps/control-panel-app/.env:\n` +
                `  ${missingKeys.join(', ')}\n` +
                `Please ensure these are defined in your env file.\n` +
                `========================================================================\n`
            );
        }
    } catch (error) {
        throw new Error(`Control-panel environment validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Bootstraps control-panel Nest app and enables CORS for agent websocket communication.
 * @returns Promise resolved once server starts listening.
 */
async function bootstrap(): Promise<void> {
    try {
        validateEnv();

        const app = await NestFactory.create(AppModule);
        const configService = app.get(ConfigService);
        const port = Number(configService.get<string>('PORT', '3000'));

        // Enable CORS for websocket communication with agent
        app.enableCors({
            origin: '*',
        });

        await app.listen(port);

        console.log(`[Control Panel App] Server running on port ${port}`);
    } catch (error) {
        console.error(`[Control Panel App] Bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

void bootstrap();
