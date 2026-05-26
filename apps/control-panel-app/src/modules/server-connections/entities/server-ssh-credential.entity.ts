import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";
import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../common/entity/base.entity";
import { ServerSshAuthType } from "../enums/server-ssh-auth-type.enum";
import { SSH_FINGERPRINT_MAX_LENGTH } from "../server-connections.constants";
import { ServerEntity } from "./server.entity";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";

@Entity({ name: "serverSshCredentials" })
@Index("IDX_serverSshCredentials_serverId", ["serverId"])
@Index("IDX_serverSshCredentials_authType", ["authType"])
export class ServerSshCredentialEntity extends BaseEntity {
  @IsUUID()
  @Column({ type: "uuid" })
  serverId!: string;

  @ManyToOne(
    () => ServerEntity,
    (server: ServerEntity) => server.sshCredentials,
    {
      nullable: false,
    },
  )
  @JoinColumn({ name: "serverId" })
  server!: ServerEntity;

  @IsUUID()
  @IsNotEmpty()
  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: "userId" })
  user!: UserEntity;

  @Column({ type: "uuid" })
  userId!: string;

  @IsEnum(ServerSshAuthType)
  @Column({
    type: "enum",
    enum: ServerSshAuthType,
    enumName: "serverSshAuthTypeEnum",
  })
  authType!: ServerSshAuthType;

  @IsOptional()
  @IsString()
  @Column({
    type: "text",
    nullable: true,
    comment:
      "Encrypted SSH private key material. Integrate with Vault/KMS before storing production secrets.",
  })
  encryptedPrivateKey!: string | null;

  @IsOptional()
  @IsString()
  @Column({
    type: "text",
    nullable: true,
    select: false,
    comment:
      "Encrypted private key passphrase. Do not store plaintext passphrases.",
  })
  privateKeyPassphrase!: string | null;

  @IsOptional()
  @IsString()
  @Column({
    type: "text",
    nullable: true,
    comment: "Encrypted SSH password. Do not store plaintext passwords.",
  })
  encryptedPassword!: string | null;

  @IsOptional()
  @IsString()
  @Column({
    type: "varchar",
    length: SSH_FINGERPRINT_MAX_LENGTH,
    nullable: true,
  })
  sshFingerprint!: string | null;
}
