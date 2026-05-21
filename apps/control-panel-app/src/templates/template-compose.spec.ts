import {
    discoverTemplateComposeFiles,
} from './template-validation/discover-template-compose-files.util';
import {
    listComposeServiceNames,
    validateTemplateComposeFile,
} from './template-validation/template-compose.validation';

import {
    buildServiceTemplateRecords,
    getDefaultTemplatesDir,
} from './build-template-records.util';

const yaml = require('js-yaml') as {
    load(input: string): unknown;
};

const TEMPLATES_DIR = getDefaultTemplatesDir(process.cwd());

function getServiceNamesFromCompose(composeYaml: string): string[] {
    const parsed = yaml.load(composeYaml);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return [];
    }

    return listComposeServiceNames(parsed as Record<string, unknown>);
}

function getIssuesForService(
    issues: { path: string; message: string }[],
    serviceName: string,
): { path: string; message: string }[] {
    const prefix = `services.${serviceName}`;

    return issues.filter(
        (issue) => issue.path === prefix || issue.path.startsWith(`${prefix}.`),
    );
}

describe('service template compose files', () => {
    const discoveredTemplates = discoverTemplateComposeFiles(TEMPLATES_DIR);

    it('discovers at least one template compose file', () => {
        expect(discoveredTemplates.length).toBeGreaterThan(0);
    });

    describe.each(discoveredTemplates.map((template) => [template.slug, template]))(
        'template %s',
        (_slug, template) => {
            const serviceNames = getServiceNamesFromCompose(template.composeYaml);

            it('has valid YAML structure and required service details', () => {
                const result = validateTemplateComposeFile({
                    slug: template.slug,
                    composePath: template.composePath,
                    composeYaml: template.composeYaml,
                    hasTemplateConfig: template.hasTemplateConfig,
                    portSchemaKeys: template.portSchemaKeys,
                    requiredEnvSchemaKeys: template.requiredEnvSchemaKeys,
                });

                if (!result.valid) {
                    const details = result.issues
                        .map((issue) => `  - [${issue.path}] ${issue.message}`)
                        .join('\n');

                    throw new Error(`Template "${template.slug}" failed validation:\n${details}`);
                }

                expect(result.valid).toBe(true);
            });

            describe.each(serviceNames.map((serviceName) => [serviceName]))(
                'service %s',
                (serviceName) => {
                    it('passes all per-service validation rules', () => {
                        const result = validateTemplateComposeFile({
                            slug: template.slug,
                            composePath: template.composePath,
                            composeYaml: template.composeYaml,
                            hasTemplateConfig: template.hasTemplateConfig,
                            portSchemaKeys: template.portSchemaKeys,
                            requiredEnvSchemaKeys: template.requiredEnvSchemaKeys,
                        });

                        const serviceIssues = getIssuesForService(result.issues, serviceName);

                        if (serviceIssues.length > 0) {
                            const details = serviceIssues
                                .map((issue) => `  - [${issue.path}] ${issue.message}`)
                                .join('\n');

                            throw new Error(
                                `Template "${template.slug}" service "${serviceName}" failed:\n${details}`,
                            );
                        }

                        expect(serviceIssues).toEqual([]);
                    });
                },
            );

            it('builds a database-ready template record from source files', () => {
                const records = buildServiceTemplateRecords(TEMPLATES_DIR);
                const record = records.find((entry) => entry.slug === template.slug);

                expect(record).toBeDefined();
                expect(record?.compose).toBeTruthy();
                expect(record?.name).toBeTruthy();
                expect(record?.is_active).toBe(true);

                const decoded = Buffer.from(record!.compose, 'base64').toString('utf8');
                const parsed = JSON.parse(decoded) as Record<string, unknown>;

                expect(parsed.services).toBeDefined();
                expect(Object.keys(parsed.services as Record<string, unknown>).length).toBeGreaterThan(0);
                expect(parsed.version).toBeUndefined();
            });
        },
    );
});
