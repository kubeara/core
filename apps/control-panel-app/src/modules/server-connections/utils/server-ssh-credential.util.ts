import { BadRequestException } from "@nestjs/common";
import { EncryptionService } from "@shared/common";
import { SshConnectionOptions } from "@shared/ssh";
import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { CreateServerSshCredentialRequestDto } from "../dto/create-server-ssh-credential.request.dto";
import { ServerEntity } from "../entities/server.entity";
import { ServerSshAuthType } from "../enums/server-ssh-auth-type.enum";
import { EncryptedCredentialFields } from "../interfaces/encrypted-credential-fields.interface";

export function assertOnboardSshInput(
  ssh: CreateServerSshCredentialRequestDto,
): void {
  if (ssh.authType === ServerSshAuthType.PASSWORD && !ssh.password) {
    throw new BadRequestException(ERROR_MESSAGES.SSH.PASSWORD_REQUIRED);
  }

  if (ssh.authType === ServerSshAuthType.PRIVATE_KEY && !ssh.privateKey) {
    throw new BadRequestException(ERROR_MESSAGES.SSH.PRIVATE_KEY_REQUIRED);
  }
}

export function encryptCredentialFields(
  encryptionService: EncryptionService,
  ssh: CreateServerSshCredentialRequestDto,
): EncryptedCredentialFields {
  let encryptedPassword: string | null = null;
  let encryptedPrivateKey: string | null = null;
  let encryptedPassphrase: string | null = null;

  if (ssh.password) {
    encryptedPassword = encryptionService.encrypt(ssh.password);
  }
  if (ssh.privateKey) {
    encryptedPrivateKey = encryptionService.encrypt(ssh.privateKey);
  }
  if (ssh.privateKeyPassphrase) {
    encryptedPassphrase = encryptionService.encrypt(ssh.privateKeyPassphrase);
  }

  return { encryptedPassword, encryptedPrivateKey, encryptedPassphrase };
}

export function buildOnboardSshTestOptions(
  encryptionService: EncryptionService,
  server: ServerEntity,
  ssh: CreateServerSshCredentialRequestDto,
): SshConnectionOptions {
  const { encryptedPassword, encryptedPassphrase } = encryptCredentialFields(
    encryptionService,
    ssh,
  );

  return {
    serverId: server.id,
    host: server.host,
    port: server.port,
    username: server.username,
    authType: ssh.authType,
    encryptedPassword,
    encryptedPrivateKey: null,
    privateKey: ssh.privateKey,
    privateKeyPassphrase: encryptedPassphrase,
  };
}
