import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { BaseEntity } from "../../../common/entity/base.entity";
import { ServerProvider } from "../enums/server-provider.enum";
import { ServerType } from "../enums/server-type.enum";
import {
  DEFAULT_SSH_PORT,
  SERVER_HOST_MAX_LENGTH,
  SERVER_NAME_MAX_LENGTH,
  SERVER_OPERATING_SYSTEM_MAX_LENGTH,
  SERVER_REGION_MAX_LENGTH,
  SSH_USERNAME_MAX_LENGTH,
} from "../server-connections.constants";
import { ServerSshCredentialEntity } from "./server-ssh-credential.entity";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";
import {
  ServerAgentError,
  ServerHealthError,
} from "../interfaces/server-health.interface";

@Entity({ name: "servers" })
@Index("IDX_servers_host", ["host"])
@Index("IDX_servers_status", ["status"])
@Index("IDX_servers_userId", ["userId"])
export class ServerEntity extends BaseEntity {
  @IsUUID()
  @IsNotEmpty()
  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: "userId" })
  user!: UserEntity;

  @Column({ type: "uuid" })
  userId!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "varchar", length: SERVER_NAME_MAX_LENGTH })
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "varchar", length: SERVER_HOST_MAX_LENGTH })
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @Column({ type: "integer", default: DEFAULT_SSH_PORT })
  port!: number;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "varchar", length: SSH_USERNAME_MAX_LENGTH })
  username!: string;

  @IsEnum(ServerProvider)
  @Column({
    type: "enum",
    enum: ServerProvider,
    enumName: "serverProviderEnum",
    default: ServerProvider.CUSTOM,
  })
  provider!: ServerProvider;

  @IsOptional()
  @IsString()
  @Column({ type: "varchar", length: SERVER_REGION_MAX_LENGTH, nullable: true })
  region!: string | null;

  @IsOptional()
  @IsString()
  @Column({
    type: "varchar",
    length: SERVER_OPERATING_SYSTEM_MAX_LENGTH,
    nullable: true,
  })
  operatingSystem!: string | null;

  @IsEnum(ServerType)
  @Column({
    type: "enum",
    enum: ServerType,
    enumName: "serverTypeEnum",
    default: ServerType.VIRTUAL_MACHINE,
  })
  serverType!: ServerType;

  @IsOptional()
  @IsDate()
  @Column({ type: "bigint", nullable: true })
  lastConnectedAt!: number | null;

  @IsBoolean()
  @Column({ type: "boolean", default: false })
  isServerUp!: boolean;

  @IsOptional()
  @IsInt()
  @Column({ type: "bigint", nullable: true })
  lastAgentCheckedAt!: number | null;

  @IsInt()
  @Min(0)
  @Column({ type: "integer", default: 0 })
  retryCount!: number;

  @IsOptional()
  @Column({ type: "jsonb", nullable: true })
  serverError!: ServerHealthError | null;

  @IsOptional()
  @Column({ type: "jsonb", nullable: true })
  agentError!: ServerAgentError | null;

  @OneToMany(
    () => ServerSshCredentialEntity,
    (credential: ServerSshCredentialEntity) => credential.server,
  )
  sshCredentials!: ServerSshCredentialEntity[];
}
