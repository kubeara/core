import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

function validateEnv(): void {
    const rootDir = process.cwd();
    const rootEnvPath = path.join(rootDir, '.env');

    // Prevent accidental use of root .env
    if (fs.existsSync(rootEnvPath) && fs.existsSync(path.join(rootDir, 'apps')) && fs.existsSync(path.join(rootDir, 'package.json'))) {
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

    let appEnvPath = path.join(rootDir, 'apps/control-panel-app/.env');
    if (!fs.existsSync(appEnvPath)) {
        if (fs.existsSync(path.join(rootDir, '.env')) && !fs.existsSync(path.join(rootDir, 'apps'))) {
            appEnvPath = path.join(rootDir, '.env');
        }
    }

    const isDocker = process.env.NODE_ENV === 'production' || process.env.DB_HOST === 'postgres';

    if (!isDocker && !fs.existsSync(appEnvPath)) {
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
    const missing = requiredKeys.filter(key => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(
            `\n========================================================================\n` +
            `[FATAL] Missing required environment variables in apps/control-panel-app/.env:\n` +
            `  ${missing.join(', ')}\n` +
            `Please ensure these are defined in your env file.\n` +
            `========================================================================\n`
        );
    }
}

async function bootstrap(): Promise<void> {
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
}

void bootstrap();
