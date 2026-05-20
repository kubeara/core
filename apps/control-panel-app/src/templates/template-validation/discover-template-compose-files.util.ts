import * as fs from 'fs';
import * as path from 'path';

export interface DiscoveredTemplateComposeFile {
    slug: string;
    composePath: string;
    composeYaml: string;
    hasTemplateConfig: boolean;
    portSchemaKeys: string[];
    requiredEnvSchemaKeys: string[];
}

/**
 * Discovers template compose sources using the same layout rules as build-template-records.
 */
export function discoverTemplateComposeFiles(templatesDir: string): DiscoveredTemplateComposeFile[] {
    if (!fs.existsSync(templatesDir)) {
        throw new Error(`Templates directory not found: ${templatesDir}`);
    }

    const discovered: DiscoveredTemplateComposeFile[] = [];
    const files = fs.readdirSync(templatesDir);

    for (const file of files) {
        const filePath = path.join(templatesDir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            const composePath = path.join(filePath, 'docker-compose.yml');
            if (!fs.existsSync(composePath)) {
                continue;
            }

            discovered.push(buildDiscoveredEntry(file, composePath));
            continue;
        }

        if (!file.endsWith('.yml')) {
            continue;
        }

        const slug = file.replace('.yml', '');
        const potentialDir = path.join(templatesDir, slug);

        if (fs.existsSync(potentialDir) && fs.statSync(potentialDir).isDirectory()) {
            continue;
        }

        discovered.push(buildDiscoveredEntry(slug, filePath));
    }

    return discovered.sort((left, right) => left.slug.localeCompare(right.slug));
}

function buildDiscoveredEntry(slug: string, composePath: string): DiscoveredTemplateComposeFile {
    const composeYaml = fs.readFileSync(composePath, 'utf8');
    const configPath = path.join(path.dirname(composePath), 'template.config.json');
    const hasTemplateConfig = fs.existsSync(configPath);

    let portSchemaKeys: string[] = [];
    let requiredEnvSchemaKeys: string[] = [];

    if (hasTemplateConfig) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
            port_schema?: Record<string, unknown>;
            env_schema?: Record<string, { required?: boolean }>;
        };

        portSchemaKeys = Object.keys(config.port_schema ?? {});
        requiredEnvSchemaKeys = Object.entries(config.env_schema ?? {})
            .filter(([, details]) => details?.required === true)
            .map(([key]) => key);
    }

    return {
        slug,
        composePath,
        composeYaml,
        hasTemplateConfig,
        portSchemaKeys,
        requiredEnvSchemaKeys,
    };
}
