import { Injectable, Logger } from "@nestjs/common";
import { Client, ConnectConfig } from "ssh2";
import { SshConnectionOptions } from "../interfaces/ssh-connection-options.interface";
import { EncryptionService } from "@shared/common";
import { SSH_DEFAULTS } from "../constants/ssh.constants";
import { SshConnectionError } from "../errors/ssh-connection.error";
import { SshAuthenticationError } from "../errors/ssh-authentication.error";

@Injectable()
export class SshConnectionManager {
  private readonly logger = new Logger(SshConnectionManager.name);
  private readonly clients = new Map<string, Client>();

  constructor(private readonly encryptionService: EncryptionService) {}

  async connect(options: SshConnectionOptions): Promise<Client> {
    const existing = this.clients.get(options.serverId);
    if (existing) {
      return existing;
    }

    const client = new Client();

    const connectConfig: ConnectConfig = {
      host: options.host,
      port: options.port,
      username: options.username,
      readyTimeout: SSH_DEFAULTS.READY_TIMEOUT,
      keepaliveInterval: SSH_DEFAULTS.KEEPALIVE_INTERVAL,
      keepaliveCountMax: SSH_DEFAULTS.KEEPALIVE_COUNT_MAX,
    };

    // Debug: show full options received (for debugging only — avoid logging secrets in production)
    console.log("SSH OPTIONS RECEIVED:", options);

    if (options.authType === "PASSWORD" || options.encryptedPassword) {
      const pwd = options.encryptedPassword
        ? this.encryptionService.decrypt(options.encryptedPassword)
        : undefined;
      connectConfig.password = pwd;
    }

    if (options.authType === "PRIVATE_KEY") {
      const key =
        options.privateKey ??
        (options.encryptedPrivateKey
          ? this.encryptionService.decrypt(options.encryptedPrivateKey)
          : undefined);

      if (!key) {
        throw new SshAuthenticationError("Missing private key");
      }

      connectConfig.privateKey = key;
    }

    return new Promise<Client>((resolve, reject) => {
      let resolved = false;

      client.on("ready", () => {
        this.logger.log(
          `SSH ready for server=${options.serverId} host=${options.host}`,
        );
        this.clients.set(options.serverId, client);
        resolved = true;
        resolve(client);
      });

      client.on("error", (err: Error) => {
        this.logger.warn(
          `SSH error server=${options.serverId} host=${options.host} msg=${String(err.message)}`,
        );
        if (!resolved) {
          // classify auth errors roughly
          if (/auth/i.test(err.message)) {
            reject(new SshAuthenticationError());
          } else {
            reject(new SshConnectionError(err.message));
          }
        }
        this.cleanupConnection(options.serverId);
      });

      client.on("close", () => {
        this.logger.log(`SSH closed for server=${options.serverId}`);
        this.cleanupConnection(options.serverId);
      });

      client.on("end", () => {
        this.logger.log(`SSH end for server=${options.serverId}`);
        this.cleanupConnection(options.serverId);
      });

      try {
        // Debug: show sanitized config (do not print privateKey contents)
        const safeConfig = {
          ...connectConfig,
          privateKey: connectConfig.privateKey ? "[REDACTED]" : undefined,
        };
        console.log("SSH CONFIG:", safeConfig);
        client.connect(connectConfig);
      } catch (err) {
        reject(new SshConnectionError(String((err as Error).message)));
      }
    });
  }

  getConnection(serverId: string): Client | null {
    const c = this.clients.get(serverId);
    return c ?? null;
  }

  disconnect(serverId: string): void {
    const client = this.clients.get(serverId);
    if (!client) return;
    try {
      client.end();
    } catch {
      this.logger.warn(`Failed to end connection server=${serverId}`);
    }
    this.cleanupConnection(serverId);
  }

  async reconnect(options: SshConnectionOptions): Promise<Client> {
    this.disconnect(options.serverId);
    return this.connect(options);
  }

  validateConnection(serverId: string): boolean {
    const client = this.clients.get(serverId);
    return !!client;
  }

  cleanupConnection(serverId: string): void {
    const client = this.clients.get(serverId);
    if (client) {
      try {
        client.removeAllListeners();
        client.end();
      } catch {
        console.log(`failed cleanup connection`);
      }
      this.clients.delete(serverId);
    }
  }
}
