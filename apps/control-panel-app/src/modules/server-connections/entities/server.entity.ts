import {
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { Column, Entity, Index, OneToMany, Unique } from "typeorm";
import { BaseEntity } from "../../../common/entity/base.entity";
import { ServerProvider } from "../enums/server-provider.enum";
import { ServerType } from "../enums/server-type.enum";
import {
  DEFAULT_SSH_PORT,
  SERVER_HOST_MAX_LENGTH,
  SERVER_NAME_MAX_LENGTH,
  SERVER_OPERATING_SYSTEM_MAX_LENGTH,
  SERVER_REGION_MAX_LENGTH,
} from "../server-connections.constants";
import { ServerSshCredentialEntity } from "./server-ssh-credential.entity";

@Entity({ name: "servers" })
@Unique("UQ_servers_host_port", ["host", "port"])
@Index("IDX_servers_host", ["host"])
@Index("IDX_servers_status", ["status"])
export class ServerEntity extends BaseEntity {
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

  @OneToMany(
    () => ServerSshCredentialEntity,
    (credential: ServerSshCredentialEntity) => credential.server,
  )
  sshCredentials!: ServerSshCredentialEntity[];
}
