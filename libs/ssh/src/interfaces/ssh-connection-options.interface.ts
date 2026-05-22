export type ServerSshAuthType = "PASSWORD" | "PRIVATE_KEY";

export interface SshConnectionOptions {
  serverId: string;
  host: string;
  port: number;
  username: string;
  authType: ServerSshAuthType;
  encryptedPassword?: string | null;
  privateKey?: string;
  encryptedPrivateKey?: string | null;
  privateKeyPassphrase?: string | null;
}
