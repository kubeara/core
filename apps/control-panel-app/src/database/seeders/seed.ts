import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

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

const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'templates',
    synchronize: true,
    entities: [ServiceTemplateEntity],
});

function isServiceTemplateSeed(value: unknown): value is ServiceTemplateSeed {
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

    const repository = AppDataSource.getRepository(ServiceTemplateEntity);

    const generatedDir = path.join(process.cwd(), 'apps/control-panel-app/generated-templates');

    const files = fs.readdirSync(generatedDir);

    for (const file of files) {
        if (!file.startsWith('service-template-')) {
            continue;
        }

        if (!file.endsWith('.json')) {
            continue;
        }

        const filePath = path.join(generatedDir, file);

        const content = fs.readFileSync(filePath, 'utf8');

        const json = JSON.parse(content) as unknown;

        if (!isServiceTemplateSeed(json)) {
            throw new Error(`Invalid service template seed file: ${file}`);
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

        console.log(`Seeded: ${json.slug}`);
    }

    await AppDataSource.destroy();
}

seed().catch(async (error: unknown) => {
    console.error(error);
    process.exit(1);
});
