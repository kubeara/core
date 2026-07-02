/**
 * Deployment Events
 * Enum for all deployment-related socket events
 */
export enum DeploymentEvents {
  DEPLOY_TEMPLATE = "deploy:template",
  DEPLOYMENT_STATUS = "deployment:status",
  AGENT_CONNECTED = "agent:connected",
  AGENT_DISCONNECTED = "agent:disconnected",
  // New MVP events
  DEPLOY = "deploy",
  REMOVE = "deploy:remove",
  DEPLOYMENT_LOG = "deployment:logs",
  /** Control panel → agent: start streaming container logs. */
  CONTAINER_LOGS_START = "container:logs:start",
  /** Agent → control panel: container logs start response. */
  CONTAINER_LOGS_START_RESULT = "container:logs:start:result",
  /** Control panel → agent / console → control panel: stop log stream. */
  CONTAINER_LOGS_STOP = "container:logs:stop",
  /** Agent → control panel → console: streamed log chunk. */
  CONTAINER_LOGS_DATA = "container:logs:data",
  /** Console client joins `container-logs:{sessionId}` before data arrives. */
  CONTAINER_LOGS_SUBSCRIBE = "container:logs:subscribe",
  /** Agent → control panel → console: log stream error. */
  CONTAINER_LOGS_ERROR = "container:logs:error",
  /** Console client joins `deployment:{deploymentId}` before logs arrive. */
  LOGS_SUBSCRIBE = "logs:subscribe",
  /** Unified log envelope broadcast on the deployments namespace. */
  DEPLOYMENT_STREAM = "deployment:stream",
  /** Control panel → agent: request runtime container list. */
  CONTAINER_DISCOVER = "container:discover",
  /** Agent → control panel: container discovery response. */
  CONTAINER_DISCOVER_RESULT = "container:discover:result",
  /** Control panel → agent: request on-demand server resource metrics. */
  SERVER_GET_RESOURCES = "server:get-resources",
  /** Agent → control panel: server resource metrics response. */
  SERVER_GET_RESOURCES_RESULT = "server:get-resources:result",
  /** Control panel → agent: execute a container lifecycle action. */
  CONTAINER_ACTION = "container:action",
  /** Agent → control panel: container action response. */
  CONTAINER_ACTION_RESULT = "container:action:result",
  /** Agent → control panel: capability advertisement on connect. */
  AGENT_HELLO = "agent:hello",
  /** Control panel → agent: create an interactive terminal session. */
  TERMINAL_CONNECT = "terminal:connect",
  /** Agent → control panel: terminal session creation response. */
  TERMINAL_CONNECT_RESULT = "terminal:connect:result",
  /** Console client joins `terminal:{sessionId}` before I/O events. */
  TERMINAL_SUBSCRIBE = "terminal:subscribe",
  /** Console → control panel → agent: terminal keystrokes. */
  TERMINAL_INPUT = "terminal:input",
  /** Agent → control panel → console: terminal output stream. */
  TERMINAL_OUTPUT = "terminal:output",
  /** Console → control panel → agent: terminal dimensions. */
  TERMINAL_RESIZE = "terminal:resize",
  /** Console/control panel → agent: close terminal session. */
  TERMINAL_DISCONNECT = "terminal:disconnect",
  /** Control panel → agent: uninstall the Kubeara agent from the host. */
  AGENT_REMOVE = "agent:remove",
  /** Agent → control panel: agent uninstall response. */
  AGENT_REMOVE_RESULT = "agent:remove:result",
  /** Control panel → agent: verify host resources before deployment. */
  DEPLOYMENT_VALIDATE = "deployment:validate",
  /** Agent → control panel: pre-deploy validation response. */
  DEPLOYMENT_VALIDATE_RESULT = "deployment:validate:result",
  /** Control panel → console: server add/delete background operation update. */
  SERVER_OPERATION_UPDATED = "server:operation-updated",
}

export type ContainerActionType = "stop" | "start" | "restart" | "delete";

export type DeploymentLogPhase = "install" | "deploy" | "container";

export type DeploymentLogStreamType = "stdout" | "stderr";

/**
 * Unified log line broadcast on the deployments namespace (console filters by deploymentId).
 */
export interface DeploymentLogStreamPayload {
  deploymentId: string;
  /** Originating Kubeara server; consoles should ignore mismatched serverId. */
  serverId?: string;
  containerId?: string;
  containerName?: string;
  phase: DeploymentLogPhase;
  source: DeploymentLogSource;
  stream: DeploymentLogStreamType;
  timestamp: string;
  message: string;
}

export interface LogsSubscribePayload {
  deploymentId: string;
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
  type: "REMOVE";
  payload: {
    deploymentId: string;
    templateSlug: string;
  };
}

export interface SocketDeployMessage {
  type: "DEPLOY";
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
    /** When true, skip RAM/CPU availability checks for this deployment only. */
    skipResourceValidation?: boolean;
  };
}

/**
 * Template Schema Field Details
 */
export interface SchemaFieldDetails {
  type?: "string" | "number" | "boolean" | "enum";
  required?: boolean;
  default?: string;
  description?: string | null;
}

/**
 * Normalized Schema Field
 */
export interface NormalizedSchemaField extends SchemaFieldDetails {
  name: string;
  section: "env" | "ports" | "root";
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
  | "pending"
  | "validating"
  | "pulling"
  | "building"
  | "deploying"
  | "running"
  | "success"
  | "failed"
  | "cancelled"
  | "removing"
  | "removed"
  | "unknown";

/**
 * Deployment Log payload (Agent -> Control Panel)
 */
export type DeploymentLogSource = "deployment" | "container" | "install";

export interface DeploymentLogPayload {
  deployment: string;
  deploymentId?: string;
  containerId?: string;
  type: "stdout" | "stderr";
  message: string;
  timestamp?: string;
  source?: DeploymentLogSource;
}

/**
 * Agent Connected Event
 */
export interface AgentConnectedPayload {
  agentId: string;
  serverId?: string;
  timestamp: string;
  totalAgents: number;
}

/**
 * Agent Disconnected Event
 */
export interface AgentDisconnectedPayload {
  agentId: string;
  serverId?: string;
  timestamp: string;
  totalAgents: number;
}

/** Raw container row returned by the agent (`docker ps` JSON lines). */
export interface DiscoveredContainerPayload {
  containerId: string;
  containerName: string;
  imageName: string;
  status: string;
  ports: string;
  runningSince: string;
  composeProject?: string;
}

export interface ContainerDiscoverRequestPayload {
  requestId: string;
}

export interface ContainerDiscoverResponsePayload {
  requestId: string;
  containers: DiscoveredContainerPayload[];
  error?: string;
}

/** CPU metrics collected from `/proc/stat` and `os` APIs. */
export interface ServerCpuMetrics {
  usagePercent: number;
  cores: number;
  loadAverage: [number, number, number];
}

/** Memory metrics collected from `/proc/meminfo` (values in bytes). */
export interface ServerMemoryMetrics {
  total: number;
  used: number;
  free: number;
  available: number;
  usagePercent: number;
}

/** Root filesystem metrics from `df -B1 /` (values in bytes). */
export interface ServerDiskMetrics {
  total: number;
  used: number;
  free: number;
  usagePercent: number;
}

/** Cumulative network I/O from `/proc/net/dev` (values in bytes). */
export interface ServerNetworkMetrics {
  rxBytes: number;
  txBytes: number;
}

/** Host identity and uptime from `/proc/uptime` and `os` APIs. */
export interface ServerSystemMetrics {
  uptime: number;
  hostname: string;
  platform: string;
  architecture: string;
  timestamp: string;
}

/** Full resource snapshot returned by the agent. */
export interface ServerResourcesMetricsPayload {
  cpu: ServerCpuMetrics;
  memory: ServerMemoryMetrics;
  disk: ServerDiskMetrics;
  network: ServerNetworkMetrics;
  system: ServerSystemMetrics;
}

export interface ServerGetResourcesRequestPayload {
  requestId: string;
}

export interface ServerGetResourcesResponsePayload {
  requestId: string;
  resources?: ServerResourcesMetricsPayload;
  error?: string;
}

export interface ContainerActionRequestPayload {
  requestId: string;
  containerId: string;
  action: ContainerActionType;
}

export interface ContainerActionResponsePayload {
  requestId: string;
  containerId: string;
  action: ContainerActionType;
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}

/** Capability handshake sent by the agent when the socket connects. */
export interface AgentHelloPayload {
  agentId: string;
  capabilities: string[];
  version: string;
  timestamp: string;
}

export interface TerminalConnectRequestPayload {
  requestId: string;
  cols: number;
  rows: number;
}

export interface TerminalConnectResponsePayload {
  requestId: string;
  sessionId?: string;
  error?: string;
}

export interface TerminalSubscribePayload {
  sessionId: string;
}

export interface TerminalInputPayload {
  sessionId: string;
  data: string;
}

export interface TerminalOutputPayload {
  sessionId: string;
  data: string;
}

export interface TerminalResizePayload {
  sessionId: string;
  rows: number;
  cols: number;
}

export interface TerminalDisconnectPayload {
  sessionId: string;
}

export interface ContainerLogsStartRequestPayload {
  requestId: string;
  sessionId: string;
  containerId: string;
}

export interface ContainerLogsStartResponsePayload {
  requestId: string;
  sessionId: string;
  error?: string;
}

export interface ContainerLogsStopPayload {
  sessionId: string;
}

export interface ContainerLogsDataPayload {
  sessionId: string;
  data: string;
}

export interface ContainerLogsErrorPayload {
  sessionId: string;
  error: string;
}

export interface ContainerLogsSubscribePayload {
  sessionId: string;
}

export interface AgentRemoveRequestPayload {
  requestId: string;
  installDir?: string;
  agentImage?: string;
}

export interface AgentRemoveResponsePayload {
  requestId: string;
  success: boolean;
  error?: string;
  /** Image refs/IDs still on the host after compose down (for SSH cleanup if needed). */
  imageRefs?: string[];
}

/** Control panel → agent: pre-deploy resource and port validation. */
export interface DeploymentValidateRequestPayload {
  requestId: string;
  templateSlug: string;
  /** Encrypted base64-encoded compose JSON (same as deploy). */
  compose: string;
  /** Encrypted JSON env object. */
  env?: string;
  /** Encrypted JSON ports object. */
  ports?: string;
  schema?: TemplateSchema;
  composeOnly?: boolean;
  useTraefik?: boolean;
}

export type DeploymentResourceWarningCode =
  | "insufficient_ram"
  | "insufficient_cpu";

export interface DeploymentResourceWarning {
  code: DeploymentResourceWarningCode;
  message: string;
}

/** Agent → control panel: pre-deploy validation response. */
export interface DeploymentValidateResponsePayload {
  requestId: string;
  available: boolean;
  error?: string;
  /** Set when RAM/CPU is insufficient but the user may override and continue. */
  warning?: DeploymentResourceWarning;
}

export type ServerOperationStatusValue =
  | "starting"
  | "removing"
  | "error"
  | null;

/** Control panel → console when a server background operation changes. */
export interface ServerOperationUpdatedPayload {
  serverId: string;
  operationStatus: ServerOperationStatusValue;
  operationError?: string | null;
  /** True when the server row was soft-deleted and should disappear from lists. */
  deleted?: boolean;
  timestamp: string;
}
