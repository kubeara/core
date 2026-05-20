/**
 * Deployment Events
 * Enum for all deployment-related socket events
 */
export enum DeploymentEvents {
    DEPLOY_TEMPLATE = 'deploy:template',
    DEPLOYMENT_STATUS = 'deployment:status',
    AGENT_CONNECTED = 'agent:connected',
    AGENT_DISCONNECTED = 'agent:disconnected',
    // New MVP events
    DEPLOY = 'deploy',
    REMOVE = 'deploy:remove',
    DEPLOYMENT_LOG = 'deployment-log',
}

/**
 * Deploy Template Payload
 * Sent from control-panel to agent to trigger deployment
 */
export interface DeployTemplatePayload {
    templateSlug: string;
    deploymentId?: string;
    metadata?: Record<string, unknown>;
    emittedAt?: string;
}

/**
 * MVP Deploy message structure (Control Panel -> Agent)
 */
/**
 * MVP Remove message structure (Control Panel -> Agent)
 */
export interface SocketRemoveMessage {
    type: 'REMOVE';
    payload: {
        deploymentId: string;
        templateSlug: string;
    };
}

export interface SocketDeployMessage {
    type: 'DEPLOY';
    payload: {
        name: string; // deployment name/slug
        // `compose` is an encrypted string (base64 of iv|tag|ciphertext) which
        // when decrypted yields the original base64-encoded JSON compose object.
        compose: string;
        // `env` is an encrypted JSON string (base64 of iv|tag|ciphertext) that
        // when decrypted yields a JSON object of env key/values.
        env?: string;
        // `ports` is an encrypted JSON string (base64 of iv|tag|ciphertext) that
        // when decrypted yields a JSON object of port key/values.
        ports?: string;
        deploymentId?: string;
        // Optional deployment schema provided by control-panel to guide agent-side validation
        schema?: TemplateSchema;
        /** When true, env/ports are resolved from compose only (Coolify-style; no template.config.json). */
        composeOnly?: boolean;
        /** Route HTTP(S) via Traefik on the agent (port 80/443, no host port publish). */
        useTraefik?: boolean;
    };
}

/**
 * Template Schema Field Details
 */
export interface SchemaFieldDetails {
    type?: 'string' | 'number' | 'boolean' | 'enum';
    required?: boolean;
    default?: any;
    description?: string | null;
}

/**
 * Normalized Schema Field
 */
export interface NormalizedSchemaField extends SchemaFieldDetails {
    name: string;
    section: 'env' | 'ports' | 'root';
}

/**
 * Template Schema Structure
 */
export interface TemplateSchema {
    env_schema?: Record<string, SchemaFieldDetails>;
    port_schema?: Record<string, SchemaFieldDetails>;
    // Normalized merged schema (array of fields) for quick agent consumption
    normalized?: NormalizedSchemaField[];
}

/**
 * Deployment Status Payload
 * Sent from agent to control-panel with deployment status updates
 */
export interface DeploymentStatusPayload {
    deploymentId: string;
    templateSlug: string;
    status: DeploymentStatus;
    progress?: number;
    message?: string;
    error?: string;
    startedAt?: string;
    completedAt?: string;
    metadata?: Record<string, unknown>;
}

/**
 * Deployment Status
 * Current state of a deployment
 */
export type DeploymentStatus =
    | 'pending'
    | 'validating'
    | 'pulling'
    | 'building'
    | 'deploying'
    | 'running'
    | 'success'
    | 'failed'
    | 'cancelled'
    | 'removing'
    | 'removed'
    | 'unknown';

/**
 * Deployment Log payload (Agent -> Control Panel)
 */
export interface DeploymentLogPayload {
    deployment: string;
    type: 'stdout' | 'stderr';
    message: string;
    timestamp?: string;
}

/**
 * Agent Connected Event
 */
export interface AgentConnectedPayload {
    agentId: string;
    timestamp: string;
    totalAgents: number;
}

/**
 * Agent Disconnected Event
 */
export interface AgentDisconnectedPayload {
    agentId: string;
    timestamp: string;
    totalAgents: number;
}
