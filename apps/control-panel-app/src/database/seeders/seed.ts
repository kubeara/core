import 'reflect-metadata';

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

import { ServiceTemplateEntity } from '../../templates/entities/service-template.entity';

interface ServiceTemplateSeed {
    slug: string;
    name: string;
    description?: string | null;
    category?: string | null;
    tags?: string[] | null;
    documentation?: string | null;
    logo?: string | null;
    compose: string;
    env_schema?: unknown;
    port_schema?: unknown;
    port?: number | null;
    version?: string | null;
    is_active?: boolean;
}

const ROOT_DIR = process.cwd();

const ROOT_ENV_PATH = path.join(ROOT_DIR, '.env');

const APP_ENV_PATH = path.join(
    ROOT_DIR,
    'apps/control-panel-app/.env',
);

/**
 * Prevent accidental root env usage
 */
if (fs.existsSync(ROOT_ENV_PATH)) {
    throw new Error(
        [
            '',
            '========================================================================',
            `[FATAL] Root .env file detected at: ${ROOT_ENV_PATH}`,
            'Root level env files are not allowed.',
            'Use only app specific env files:',
            '  - apps/control-panel-app/.env',
            '  - apps/agent-app/.env',
            '========================================================================',
            '',
        ].join('\n'),
    );
}

/**
 * Ensure control panel env exists
 */
if (!fs.existsSync(APP_ENV_PATH)) {
    throw new Error(
        [
            '',
            '========================================================================',
            `[FATAL] Missing env file: ${APP_ENV_PATH}`,
            'Please create the file before running the seed script.',
            '========================================================================',
            '',
        ].join('\n'),
    );
}

/**
 * Load control panel env
 */
dotenv.config({
    path: APP_ENV_PATH,
});

/**
 * Validate required database envs
 */
const REQUIRED_ENV_KEYS = [
    'DB_HOST',
    'DB_PORT',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_DATABASE',
] as const;

const missingEnvKeys = REQUIRED_ENV_KEYS.filter(
    key => !process.env[key],
);

if (missingEnvKeys.length > 0) {
    throw new Error(
        [
            '',
            '========================================================================',
            '[FATAL] Missing required environment variables:',
            ...missingEnvKeys.map(key => `  - ${key}`),
            '========================================================================',
            '',
        ].join('\n'),
    );
}

const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST as string,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME as string,
    password: process.env.DB_PASSWORD as string,
    database: process.env.DB_DATABASE as string,
    synchronize: false,
    entities: [ServiceTemplateEntity],
});

function isServiceTemplateSeed(
    value: unknown,
): value is ServiceTemplateSeed {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Partial<ServiceTemplateSeed>;

    return (
        typeof candidate.slug === 'string' &&
        typeof candidate.name === 'string' &&
        typeof candidate.compose === 'string'
    );
}

async function seed(): Promise<void> {
    await AppDataSource.initialize();

    const repository =
        AppDataSource.getRepository(ServiceTemplateEntity);

    const generatedTemplatesDir = path.join(
        ROOT_DIR,
        'apps/control-panel-app/generated-templates',
    );

    if (!fs.existsSync(generatedTemplatesDir)) {
        throw new Error(
            `Generated templates directory not found: ${generatedTemplatesDir}`,
        );
    }

    const files = fs.readdirSync(generatedTemplatesDir);

    for (const file of files) {
        if (!file.startsWith('service-template-')) {
            continue;
        }

        if (!file.endsWith('.json')) {
            continue;
        }

        const filePath = path.join(
            generatedTemplatesDir,
            file,
        );

        const content = fs.readFileSync(filePath, 'utf8');

        const json = JSON.parse(content) as unknown;

        if (!isServiceTemplateSeed(json)) {
            throw new Error(
                `Invalid service template seed file: ${file}`,
            );
        }

        await repository.upsert(
            {
                slug: json.slug,
                name: json.name,
                description: json.description ?? null,
                category: json.category ?? null,
                tags: json.tags ?? null,
                documentation: json.documentation ?? null,
                logo: json.logo ?? null,
                compose: json.compose,
                env_schema: json.env_schema ?? null,
                port_schema: json.port_schema ?? null,
                port: json.port ?? null,
                version: json.version ?? null,
                is_active: json.is_active ?? true,
            },
            ['slug'],
        );

        console.log(`Seeded template: ${json.slug}`);
    }

    await AppDataSource.destroy();

    console.log('Template seeding completed successfully');
}

seed().catch(async (error: unknown) => {
    console.error(error);

    process.exit(1);
});