import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
    ComposeParserService,
    EncryptionService,
    TemplateConfigService,
    TemplatePayloadService,
    maskEnvMap,
} from '@shared/common';
import { DeploymentStatus, SchemaFieldDetails, TemplateSchema } from '@shared/socket-events';

import { ServiceTemplateEntity } from '../templates/entities/service-template.entity';
import { EnvironmentVariableEntity } from './entities/environment-variable.entity';
import { ServiceDeploymentEntity } from './entities/service-deployment.entity';

export interface PrepareDeploymentInput {
    templateSlug: string;
    requestEnv?: Record<string, unknown>;
    requestPorts?: Record<string, unknown>;
    /** When set, load stored variables and merge request overrides (redeploy). */
    existingDeploymentId?: string;
}

export interface PreparedDeployment {
    deploymentId: string;
    templateSlug: string;
    encodedCompose: string;
    mergedEnv: Record<string, string>;
    mergedPorts: Record<string, number>;
    generatedKeys: string[];
    schema?: TemplateSchema;
    composeOnly?: boolean;
}

export interface EnvironmentVariableView {
    key: string;
    value: string | null;
    is_required: boolean;
    is_generated: boolean;
    comment: string | null;
    updated_at: Date;
}

@Injectable()
export class DeploymentsService {
    private readonly logger = new Logger(DeploymentsService.name);

    constructor(
        @InjectRepository(ServiceDeploymentEntity)
        private readonly deploymentRepository: Repository<ServiceDeploymentEntity>,
        @InjectRepository(EnvironmentVariableEntity)
        private readonly environmentVariableRepository: Repository<EnvironmentVariableEntity>,
        @InjectRepository(ServiceTemplateEntity)
        private readonly templateRepository: Repository<ServiceTemplateEntity>,
        private readonly templatePayloadService: TemplatePayloadService,
        private readonly templateConfigService: TemplateConfigService,
        private readonly composeParserService: ComposeParserService,
        private readonly encryptionService: EncryptionService,
    ) {}

    generateDeploymentId(): string {
        return `deployment-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }

    async prepareDeployment(input: PrepareDeploymentInput): Promise<PreparedDeployment> {
        const { templateSlug, requestEnv = {}, requestPorts = {}, existingDeploymentId } = input;

        const template = await this.templateRepository.findOne({ where: { slug: templateSlug } });
        if (!template?.compose) {
            throw new NotFoundException(`Template '${templateSlug}' not found`);
        }

        const hasSchema = Boolean(template.env_schema || template.port_schema);
        if (!hasSchema) {
            return this.prepareComposeDeployment(input);
        }

        const schema: TemplateSchema = {
            env_schema: template.env_schema as Record<string, SchemaFieldDetails>,
            port_schema: template.port_schema as Record<string, SchemaFieldDetails>,
        };
        const normalized = this.templateConfigService.normalizeSchema(schema);
        const portSchemaKeys = Object.keys(schema.port_schema ?? {});

        let baseEnv: Record<string, unknown> = { ...requestEnv };
        let basePorts: Record<string, unknown> = { ...requestPorts };

        if (existingDeploymentId) {
            const stored = await this.loadStoredVariables(existingDeploymentId, portSchemaKeys);
            baseEnv = { ...stored.env, ...requestEnv };
            basePorts = { ...stored.ports, ...requestPorts };
        }

        const composeYaml = this.templatePayloadService.decodeBase64ToYaml(template.compose);
        const parsedFromCompose = this.composeParserService.resolveFromCompose({
            compose: composeYaml,
            userEnv: baseEnv,
            userPorts: basePorts,
            portSchemaKeys,
        });

        const { env: mergedEnv, ports: mergedPorts } = this.templateConfigService.mergeAndValidate(
            { ...schema, normalized },
            { env: parsedFromCompose.env, ports: parsedFromCompose.ports },
        );

        const deploymentId = existingDeploymentId ?? this.generateDeploymentId();

        await this.upsertDeploymentRecord({
            deploymentId,
            templateSlug,
            status: 'pending',
        });

        await this.persistEnvironmentVariables({
            deploymentId,
            env: mergedEnv,
            ports: mergedPorts,
            generatedKeys: parsedFromCompose.generatedKeys,
            schema,
        });

        if (parsedFromCompose.generatedKeys.length > 0) {
            this.logger.log(
                `Stored auto-generated variables for '${deploymentId}': ${parsedFromCompose.generatedKeys.join(', ')}`,
            );
        }

        return {
            deploymentId,
            templateSlug,
            encodedCompose: template.compose,
            mergedEnv,
            mergedPorts,
            generatedKeys: parsedFromCompose.generatedKeys,
            schema: { ...schema, normalized },
            composeOnly: false,
        };
    }

    /**
     * Coolify-style deploy: resolve and validate env entirely from docker-compose.yml
     * (no template.config.json / env_schema / port_schema).
     */
    async prepareComposeDeployment(input: PrepareDeploymentInput): Promise<PreparedDeployment> {
        const { templateSlug, requestEnv = {}, requestPorts = {}, existingDeploymentId } = input;

        const template = await this.templateRepository.findOne({ where: { slug: templateSlug } });
        if (!template?.compose) {
            throw new NotFoundException(`Template '${templateSlug}' not found`);
        }

        let baseEnv: Record<string, unknown> = { ...requestEnv };
        let basePorts: Record<string, unknown> = { ...requestPorts };

        if (existingDeploymentId) {
            const stored = await this.loadStoredVariables(existingDeploymentId, []);
            baseEnv = { ...stored.env, ...requestEnv };
            basePorts = { ...stored.ports, ...requestPorts };
        }

        const composeYaml = this.templatePayloadService.decodeBase64ToYaml(template.compose);

        const unknownPortKeys = this.composeParserService.findUnknownPortKeys(composeYaml, requestPorts);
        if (unknownPortKeys.length > 0) {
            const expected = this.composeParserService.listPortVariables(composeYaml);
            throw new BadRequestException(
                `Unknown port keys: ${unknownPortKeys.join(', ')}. ` +
                    `Template '${templateSlug}' expects: ${expected.join(', ') || '(none)'}`,
            );
        }

        // Fallback: template catalog port (e.g. 5432) when compose has no default for a required SERVICE_PORT_*
        const requiredPortVars = this.composeParserService
            .inferRequiredVariables(composeYaml)
            .filter((name) => name.startsWith('SERVICE_PORT_'));

        if (template.port && requiredPortVars.length === 1) {
            const portVar = requiredPortVars[0];
            if (basePorts[portVar] === undefined && baseEnv[portVar] === undefined) {
                basePorts[portVar] = template.port;
            }
        }

        let parsedFromCompose;
        try {
            parsedFromCompose = this.composeParserService.resolveAndValidateFromCompose({
                compose: composeYaml,
                userEnv: baseEnv,
                userPorts: basePorts,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const required = this.composeParserService.inferRequiredVariables(composeYaml);
            const hint = required.length > 0
                ? ` Required: ${required.join(', ')}. Pass them in "ports" or "env", or use POST /deploy/compose with a template that defines compose defaults.`
                : '';
            throw new BadRequestException(`${message}.${hint}`);
        }

        const mergedEnv = parsedFromCompose.env;
        const mergedPorts = parsedFromCompose.ports;
        const requiredKeys = new Set(this.composeParserService.inferRequiredVariables(composeYaml));
        const deploymentId = existingDeploymentId ?? this.generateDeploymentId();

        await this.upsertDeploymentRecord({
            deploymentId,
            templateSlug,
            status: 'pending',
        });

        await this.persistEnvironmentVariables({
            deploymentId,
            env: mergedEnv,
            ports: mergedPorts,
            generatedKeys: parsedFromCompose.generatedKeys,
            requiredKeys,
        });

        if (parsedFromCompose.generatedKeys.length > 0) {
            this.logger.log(
                `Stored auto-generated variables for '${deploymentId}': ${parsedFromCompose.generatedKeys.join(', ')}`,
            );
        }

        return {
            deploymentId,
            templateSlug,
            encodedCompose: template.compose,
            mergedEnv,
            mergedPorts,
            generatedKeys: parsedFromCompose.generatedKeys,
            composeOnly: true,
        };
    }

    async getDeployment(deploymentId: string): Promise<ServiceDeploymentEntity> {
        const deployment = await this.deploymentRepository.findOne({
            where: { id: deploymentId },
        });

        if (!deployment) {
            throw new NotFoundException(`Deployment '${deploymentId}' not found`);
        }

        return deployment;
    }

    async listEnvironmentVariables(
        deploymentId: string,
        options: { maskSecrets?: boolean } = {},
    ): Promise<EnvironmentVariableView[]> {
        await this.getDeployment(deploymentId);

        const rows = await this.environmentVariableRepository.find({
            where: { deployment_id: deploymentId },
            order: { key: 'ASC' },
        });

        const { maskSecrets = true } = options;
        const decrypted: Record<string, string> = {};
        for (const row of rows) {
            decrypted[row.key] = this.decryptValue(row.value);
        }

        const display = maskSecrets ? maskEnvMap(decrypted) : decrypted;

        return rows.map((row) => ({
            key: row.key,
            value: display[row.key] ?? null,
            is_required: row.is_required,
            is_generated: row.is_generated,
            comment: row.comment,
            updated_at: row.updated_at,
        }));
    }

    async updateEnvironmentVariables(
        deploymentId: string,
        updates: { env?: Record<string, unknown>; ports?: Record<string, unknown> },
    ): Promise<EnvironmentVariableView[]> {
        const deployment = await this.getDeployment(deploymentId);
        const template = await this.templateRepository.findOne({
            where: { slug: deployment.template_slug },
        });

        if (!template) {
            throw new NotFoundException(`Template '${deployment.template_slug}' not found`);
        }

        const schema: TemplateSchema = {
            env_schema: template.env_schema as Record<string, SchemaFieldDetails>,
            port_schema: template.port_schema as Record<string, SchemaFieldDetails>,
        };
        const portSchemaKeys = Object.keys(schema.port_schema ?? {});

        const stored = await this.loadStoredVariables(deploymentId, portSchemaKeys);
        const mergedEnv = { ...stored.env, ...(updates.env ?? {}) };
        const mergedPorts = { ...stored.ports, ...(updates.ports ?? {}) };

        const composeYaml = this.templatePayloadService.decodeBase64ToYaml(template.compose);
        const parsedFromCompose = this.composeParserService.resolveFromCompose({
            compose: composeYaml,
            userEnv: mergedEnv,
            userPorts: mergedPorts,
            portSchemaKeys,
        });

        const normalized = this.templateConfigService.normalizeSchema(schema);
        const { env: validatedEnv, ports: validatedPorts } = this.templateConfigService.mergeAndValidate(
            { ...schema, normalized },
            { env: parsedFromCompose.env, ports: parsedFromCompose.ports },
        );

        await this.persistEnvironmentVariables({
            deploymentId,
            env: validatedEnv,
            ports: validatedPorts,
            generatedKeys: [],
            schema,
        });

        return this.listEnvironmentVariables(deploymentId);
    }

    async updateStatus(
        deploymentId: string,
        status: DeploymentStatus,
        options: { message?: string; error?: string } = {},
    ): Promise<void> {
        const deployment = await this.getDeployment(deploymentId);

        deployment.status = status;
        deployment.status_message = options.message ?? deployment.status_message;
        if (options.error) {
            deployment.last_error = options.error;
        }

        await this.deploymentRepository.save(deployment);
    }

    async loadResolvedForAgent(
        deploymentId: string,
        portSchemaKeys: string[],
    ): Promise<{ env: Record<string, string>; ports: Record<string, number> }> {
        return this.loadStoredVariables(deploymentId, portSchemaKeys);
    }

    private async upsertDeploymentRecord(opts: {
        deploymentId: string;
        templateSlug: string;
        status: DeploymentStatus;
    }): Promise<void> {
        const existing = await this.deploymentRepository.findOne({
            where: { id: opts.deploymentId },
        });

        if (existing) {
            existing.template_slug = opts.templateSlug;
            existing.status = opts.status;
            await this.deploymentRepository.save(existing);
            return;
        }

        const deployment = this.deploymentRepository.create({
            id: opts.deploymentId,
            template_slug: opts.templateSlug,
            status: opts.status,
            status_message: null,
            last_error: null,
        });

        await this.deploymentRepository.save(deployment);
    }

    private async persistEnvironmentVariables(opts: {
        deploymentId: string;
        env: Record<string, string>;
        ports: Record<string, number>;
        generatedKeys: string[];
        schema?: TemplateSchema;
        requiredKeys?: Set<string>;
    }): Promise<void> {
        const generated = new Set(opts.generatedKeys);
        const requiredKeys = opts.requiredKeys ?? new Set<string>();

        if (!opts.requiredKeys && opts.schema) {
            for (const field of opts.schema.normalized ?? this.templateConfigService.normalizeSchema(opts.schema)) {
                if (field.required) {
                    requiredKeys.add(field.name);
                }
            }
        }

        const allEntries: Record<string, string> = {
            ...opts.env,
            ...Object.fromEntries(
                Object.entries(opts.ports).map(([key, value]) => [key, String(value)]),
            ),
        };

        for (const [key, value] of Object.entries(allEntries)) {
            await this.environmentVariableRepository.upsert(
                {
                    deployment_id: opts.deploymentId,
                    key,
                    value: this.encryptValue(value),
                    is_required: requiredKeys.has(key),
                    is_generated: generated.has(key),
                    comment: null,
                },
                ['deployment_id', 'key'],
            );
        }
    }

    private async loadStoredVariables(
        deploymentId: string,
        portSchemaKeys: string[],
    ): Promise<{ env: Record<string, string>; ports: Record<string, number> }> {
        const rows = await this.environmentVariableRepository.find({
            where: { deployment_id: deploymentId },
        });

        const env: Record<string, string> = {};
        const ports: Record<string, number> = {};
        const portKeys = new Set(portSchemaKeys);

        for (const row of rows) {
            const plain = this.decryptValue(row.value);

            if (portKeys.has(row.key) || row.key.startsWith('SERVICE_PORT_')) {
                const parsed = Number(plain);
                if (!Number.isNaN(parsed)) {
                    ports[row.key] = parsed;
                }
                continue;
            }

            env[row.key] = plain;
        }

        return { env, ports };
    }

    private encryptValue(value: string): string {
        return this.encryptionService.encrypt(value);
    }

    private decryptValue(encrypted: string): string {
        return this.encryptionService.decrypt(encrypted);
    }
}
