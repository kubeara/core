import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  ComposeParserService,
  EncryptionService,
  ServerUrlContext,
  SUCCESS_MESSAGES,
  TemplateConfigService,
  TemplatePayloadService,
  maskEnvMap,
} from "@shared/common";
import {
  DeploymentStatus,
  SchemaFieldDetails,
  TemplateSchema,
  SocketDeployMessage,
  SocketRemoveMessage,
} from "@shared/socket-events";

import { DeploymentGateway } from "@control-panel/websocket/websocket.gateway";
import { EnvironmentVariableEntity } from "./entities/environment-variable.entity";
import { ServiceDeploymentEntity } from "./entities/service-deployment.entity";
import { ServiceTemplateEntity } from "@control-panel/modules/templates";

export interface PrepareDeploymentInput {
  templateSlug: string;
  requestEnv?: Record<string, unknown>;
  requestPorts?: Record<string, unknown>;
  /** When set, load stored variables and merge request overrides (redeploy). */
  existingDeploymentId?: string;
  /** Agent/server context for SERVICE_URL_* / SERVICE_FQDN_* generation (deploymentId added internally). */
  serverUrlContext?: Omit<ServerUrlContext, "deploymentId">;
}

export interface BuildServerUrlContextInput {
  useTraefikRequest?: boolean;
  requestEnv?: Record<string, unknown>;
  requestPorts?: Record<string, unknown>;
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
  useTraefik?: boolean;
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
    @Inject(forwardRef(() => DeploymentGateway))
    private readonly deploymentGateway: DeploymentGateway,
  ) {}

  generateDeploymentId(): string {
    return `deployment-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Builds URL generation context for SERVICE_URL_* / SERVICE_FQDN_* and Traefik-oriented resolution.
   *
   * Precedence:
   * - If the client sends `useTraefik`, that value wins.
   * - Else if the client passes any `SERVICE_PORT_*` host binding in `ports` or `env`, Traefik is off
   *   so declared ports are not stripped for that deploy.
   * - Else default from `TRAEFIK_ENABLED` on the **control panel** process (not the agent `.env`).
   *
   * Templates such as n8n with `SERVICE_URL_*` / `SERVICE_FQDN_*` work without Traefik when
   * `useTraefik` is false and a `SERVICE_PORT_*` is supplied (or auto-filled). To force direct
   * host ports: `"useTraefik": false` and `"ports": { "SERVICE_PORT_N8N": 5678 }`.
   */
  buildServerUrlContext(
    options: BuildServerUrlContextInput,
  ): Omit<ServerUrlContext, "deploymentId"> {
    const { useTraefikRequest, requestEnv = {}, requestPorts = {} } = options;

    const publicIp =
      this.deploymentGateway.getPrimaryAgentPublicIp() ?? "127.0.0.1";

    let useTraefik: boolean;
    if (useTraefikRequest !== undefined) {
      useTraefik = Boolean(useTraefikRequest);
    } else if (
      this.requestContainsExplicitServiceHostPorts(requestPorts, requestEnv)
    ) {
      useTraefik = false;
    } else {
      useTraefik = process.env.TRAEFIK_ENABLED === "true";
    }

    return {
      publicIp,
      wildcardDomain: process.env.WILDCARD_DOMAIN ?? null,
      forceHttps: process.env.FORCE_HTTPS === "true",
      useTraefik,
    };
  }

  /**
   * Encrypts prepared deployment payload and emits DEPLOY to connected agents.
   */
  emitPreparedDeployment(
    prepared: PreparedDeployment,
    isRedeploy: boolean,
  ): { message: string; template: string; deploymentId: string } {
    this.logger.debug(
      `[emitPreparedDeployment] deploymentId=${prepared.deploymentId} mergedPorts=${JSON.stringify(prepared.mergedPorts)}`,
    );

    const encryptedCompose = this.encryptionService.encrypt(
      prepared.encodedCompose,
    );
    const encryptedEnv = this.encryptionService.encrypt(
      JSON.stringify(prepared.mergedEnv),
    );
    const encryptedPorts = this.encryptionService.encrypt(
      JSON.stringify(prepared.mergedPorts),
    );

    const message: SocketDeployMessage = {
      type: "DEPLOY",
      payload: {
        name: prepared.templateSlug,
        compose: encryptedCompose,
        env: encryptedEnv,
        ports: encryptedPorts,
        deploymentId: prepared.deploymentId,
        schema: prepared.schema,
        composeOnly: prepared.composeOnly,
        useTraefik: prepared.useTraefik,
      },
    };

    this.deploymentGateway.emitDeploy(message);

    return {
      message: isRedeploy ? "Redeployment initiated" : "Deployment initiated",
      template: prepared.templateSlug,
      deploymentId: prepared.deploymentId,
    };
  }

  async prepareDeployment(
    input: PrepareDeploymentInput,
  ): Promise<PreparedDeployment> {
    const {
      templateSlug,
      requestEnv = {},
      requestPorts = {},
      existingDeploymentId,
    } = input;

    const template = await this.templateRepository.findOne({
      where: { slug: templateSlug },
    });
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
      const stored = await this.loadStoredVariables(
        existingDeploymentId,
        portSchemaKeys,
      );
      baseEnv = { ...stored.env, ...requestEnv };
      basePorts = { ...stored.ports, ...requestPorts };
    }

    const composeYaml = this.templatePayloadService.decodeBase64ToYaml(
      template.compose,
    );
    const parsedFromCompose = this.composeParserService.resolveFromCompose({
      compose: composeYaml,
      userEnv: baseEnv,
      userPorts: basePorts,
      portSchemaKeys,
    });

    const { env: mergedEnv, ports: mergedPorts } =
      this.templateConfigService.mergeAndValidate(
        { ...schema, normalized },
        { env: parsedFromCompose.env, ports: parsedFromCompose.ports },
      );

    const deploymentId = existingDeploymentId ?? this.generateDeploymentId();

    await this.upsertDeploymentRecord({
      deploymentId,
      templateSlug,
      status: "pending",
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
        `Stored auto-generated variables for '${deploymentId}': ${parsedFromCompose.generatedKeys.join(", ")}`,
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
  async prepareComposeDeployment(
    input: PrepareDeploymentInput,
  ): Promise<PreparedDeployment> {
    const {
      templateSlug,
      requestEnv = {},
      requestPorts = {},
      existingDeploymentId,
      serverUrlContext: serverUrlContextInput,
    } = input;

    const template = await this.templateRepository.findOne({
      where: { slug: templateSlug },
    });
    if (!template?.compose) {
      throw new NotFoundException(`Template '${templateSlug}' not found`);
    }

    const deploymentId = existingDeploymentId ?? this.generateDeploymentId();
    const serverUrlContext: ServerUrlContext | undefined = serverUrlContextInput
      ? { ...serverUrlContextInput, deploymentId }
      : undefined;

    let baseEnv: Record<string, unknown> = { ...requestEnv };
    let basePorts: Record<string, unknown> = { ...requestPorts };

    if (existingDeploymentId) {
      const stored = await this.loadStoredVariables(existingDeploymentId, []);
      baseEnv = { ...stored.env, ...requestEnv };
      basePorts = { ...stored.ports, ...requestPorts };
      this.logger.debug(
        `[prepareComposeDeployment] merged redeploy ports deploymentId=${deploymentId} basePorts=${JSON.stringify(basePorts)}`,
      );
    }

    const composeYaml = this.templatePayloadService.decodeBase64ToYaml(
      template.compose,
    );

    const unknownPortKeys = this.composeParserService.findUnknownPortKeys(
      composeYaml,
      requestPorts,
    );
    if (unknownPortKeys.length > 0) {
      const expected = this.composeParserService.listPortVariables(composeYaml);
      throw new BadRequestException(
        `Unknown port keys: ${unknownPortKeys.join(", ")}. ` +
          `Template '${templateSlug}' expects: ${expected.join(", ") || "(none)"}`,
      );
    }

    const inferOptions = serverUrlContext ? { serverUrlContext } : undefined;

    const requiredPortVars = this.composeParserService
      .inferRequiredVariables(composeYaml, inferOptions)
      .filter((name) => name.startsWith("SERVICE_PORT_"));

    if (template.port && requiredPortVars.length === 1) {
      const portVar = requiredPortVars[0];
      if (basePorts[portVar] === undefined && baseEnv[portVar] === undefined) {
        basePorts[portVar] = template.port;
        this.logger.debug(
          `[prepareComposeDeployment] applied template default port deploymentId=${deploymentId} ${portVar}=${template.port}`,
        );
      }
    }

    let parsedFromCompose;
    try {
      parsedFromCompose =
        this.composeParserService.resolveAndValidateFromCompose({
          compose: composeYaml,
          userEnv: baseEnv,
          userPorts: basePorts,
          serverUrlContext,
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const required = this.composeParserService.inferRequiredVariables(
        composeYaml,
        inferOptions,
      );
      const hint =
        required.length > 0
          ? ` Required: ${required.join(", ")}. Pass them in "ports" or "env".`
          : "";
      if (!serverUrlContext && composeYaml.includes("SERVICE_URL_")) {
        throw new BadRequestException(
          `${message}.${hint} Connect an agent with AGENT_PUBLIC_IP set for auto URL generation.`,
        );
      }
      throw new BadRequestException(`${message}.${hint}`);
    }

    const mergedEnv = parsedFromCompose.env;
    const mergedPorts = parsedFromCompose.ports;

    const requiredKeys = new Set(
      this.composeParserService.inferRequiredVariables(
        composeYaml,
        inferOptions,
      ),
    );

    await this.upsertDeploymentRecord({
      deploymentId,
      templateSlug,
      status: "pending",
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
        `Stored auto-generated variables for '${deploymentId}': ${parsedFromCompose.generatedKeys.join(", ")}`,
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
      useTraefik: serverUrlContext?.useTraefik,
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
      order: { key: "ASC" },
    });

    const { maskSecrets = true } = options;
    const decrypted: Record<string, string> = {};
    for (const row of rows) {
      decrypted[row.key] = this.decryptValue(row.value);
    }

    const display = maskSecrets ? maskEnvMap(decrypted) : decrypted;

    return rows.map((row) => {
      const raw = display[row.key];

      let value: string | null;

      if (raw == null) {
        value = null;
      } else if (typeof raw === "string") {
        value = raw;
      } else if (
        typeof raw === "number" ||
        typeof raw === "boolean" ||
        typeof raw === "bigint"
      ) {
        value = `${raw}`;
      } else {
        value = JSON.stringify(raw);
      }

      return {
        key: row.key,
        value,
        is_required: row.is_required,
        is_generated: row.is_generated,
        comment: row.comment,
        updated_at: row.updated_at,
      };
    });
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
      throw new NotFoundException(
        `Template '${deployment.template_slug}' not found`,
      );
    }

    const schema: TemplateSchema = {
      env_schema: template.env_schema as Record<string, SchemaFieldDetails>,
      port_schema: template.port_schema as Record<string, SchemaFieldDetails>,
    };
    const portSchemaKeys = Object.keys(schema.port_schema ?? {});

    const stored = await this.loadStoredVariables(deploymentId, portSchemaKeys);
    const mergedEnv = { ...stored.env, ...(updates.env ?? {}) };
    const mergedPorts = { ...stored.ports, ...(updates.ports ?? {}) };

    const composeYaml = this.templatePayloadService.decodeBase64ToYaml(
      template.compose,
    );
    const parsedFromCompose = this.composeParserService.resolveFromCompose({
      compose: composeYaml,
      userEnv: mergedEnv,
      userPorts: mergedPorts,
      portSchemaKeys,
    });

    const normalized = this.templateConfigService.normalizeSchema(schema);
    const { env: validatedEnv, ports: validatedPorts } =
      this.templateConfigService.mergeAndValidate(
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
      for (const field of opts.schema.normalized ??
        this.templateConfigService.normalizeSchema(opts.schema)) {
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
        ["deployment_id", "key"],
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

      if (portKeys.has(row.key) || row.key.startsWith("SERVICE_PORT_")) {
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

  /**
   * Starts removal of a deployment: marks it removing, notifies agents, and waits for
   * agent confirmation before soft-deleting the DB record (handled in the gateway).
   */
  async removeDeployment(deploymentId: string): Promise<{
    deploymentId: string;
    status: DeploymentStatus;
    message: string;
  }> {
    const deployment = await this.getDeployment(deploymentId);
    const blockingStatuses: DeploymentStatus[] = [
      "pending",
      "validating",
      "pulling",
      "building",
      "deploying",
      "removing",
      "removed",
    ];

    if (blockingStatuses.includes(deployment.status)) {
      throw new ConflictException(
        `Deployment '${deploymentId}' cannot be removed while status is '${deployment.status}'`,
      );
    }

    if (this.deploymentGateway.getConnectedAgentsCount() === 0) {
      throw new ConflictException(
        "No agent is connected. Connect an agent before removing a deployment.",
      );
    }

    await this.updateStatus(deploymentId, "removing", {
      message: SUCCESS_MESSAGES.REMOVING,
    });

    const message: SocketRemoveMessage = {
      type: "REMOVE",
      payload: {
        deploymentId,
        templateSlug: deployment.template_slug,
      },
    };

    this.deploymentGateway.emitRemove(message);

    this.logger.log(`Removal requested for deployment '${deploymentId}'`);

    return {
      deploymentId,
      status: "removing",
      message: SUCCESS_MESSAGES.REMOVING,
    };
  }

  /**
   * Soft-deletes a deployment after agent teardown while preserving env vars and history.
   */
  async softDeleteDeploymentRecord(
    deploymentId: string,
    options: { message?: string } = {},
  ): Promise<void> {
    const deployment = await this.deploymentRepository.findOne({
      where: { id: deploymentId },
      withDeleted: true,
    });

    if (!deployment || deployment.deleted_at) {
      return;
    }

    deployment.status = "removed";
    deployment.status_message =
      options.message ?? SUCCESS_MESSAGES.REMOVAL_COMPLETED;
    deployment.last_error = null;

    await this.deploymentRepository.save(deployment);
    await this.deploymentRepository.softDelete({ id: deploymentId });

    this.logger.log(`Soft-deleted deployment record '${deploymentId}'`);
  }

  /**
   * Returns true when the deploy request supplies at least one SERVICE_PORT_* value
   * (host publish intent). Used to avoid Traefik mode stripping those keys.
   */
  private requestContainsExplicitServiceHostPorts(
    requestPorts: Record<string, unknown>,
    requestEnv: Record<string, unknown>,
  ): boolean {
    const hasServicePortValue = (value: unknown): boolean =>
      value !== undefined && value !== null && value !== "";

    for (const [key, value] of Object.entries(requestPorts)) {
      if (key.startsWith("SERVICE_PORT_") && hasServicePortValue(value)) {
        return true;
      }
    }
    for (const [key, value] of Object.entries(requestEnv)) {
      if (key.startsWith("SERVICE_PORT_") && hasServicePortValue(value)) {
        return true;
      }
    }
    return false;
  }
}
