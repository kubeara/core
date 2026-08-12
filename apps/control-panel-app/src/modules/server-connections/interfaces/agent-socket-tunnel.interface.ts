import { ServerEntity } from "../entities/server.entity";
import { ServerSshCredentialEntity } from "../entities/server-ssh-credential.entity";

/**
 * Result of opening or reusing an SSH reverse tunnel for agent WebSocket connectivity.
 */
export interface AgentSocketTunnelResult {
  /** Whether the tunnel is ready (or cloud/local skip applies). */
  ok: boolean;
  /** True when cloud mode or local server — no tunnel was needed. */
  skipped?: boolean;
  /** Human-readable failure reason when `ok` is false. */
  error?: string;
}

/**
 * Input for {@link AgentSocketTunnelService.ensureForServer}.
 *
 * Used during onboard when server and credential entities are already loaded.
 */
export interface EnsureAgentSocketTunnelInput {
  /** Active server row (host, port, username, type). */
  server: Pick<
    ServerEntity,
    "id" | "host" | "port" | "username" | "serverType"
  >;
  /** Encrypted SSH credential for the server. */
  credential: ServerSshCredentialEntity;
  /** Optional decrypted private key from onboard request (not persisted). */
  plainPrivateKey?: string;
}
