import { Column, Entity, Index } from "typeorm";
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

import { BaseEntity } from "@control-panel/common/entity/base.entity";

import { InstallationEventType } from "../enums/installation-event-type.enum";

/**
 * One row per self-hosted/local Kubeara installation lifecycle event.
 *
 * BaseEntity also provides: id, status, metadata, createdAt, updatedAt, deletedAt.
 */
@Entity({ name: "selfHostInstallations" })
@Index("IDX_self_host_installations_installationId", ["installationId"])
@Index("IDX_self_host_installations_eventType", ["eventType"])
@Index("IDX_self_host_installations_createdAt", ["createdAt"])
export class SelfHostInstallationEntity extends BaseEntity {
  @IsUUID()
  @Column({ type: "uuid" })
  installationId!: string;

  @IsEnum(InstallationEventType)
  @Column({ type: "varchar", length: 32 })
  eventType!: InstallationEventType;

  @IsString()
  @MaxLength(64)
  @Column({ type: "varchar", length: 64 })
  version!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Column({ type: "varchar", length: 64, nullable: true })
  previousVersion!: string | null;

  @IsString()
  @MaxLength(255)
  @Column({ type: "varchar", length: 255 })
  ipAddress!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Column({ type: "varchar", length: 512, nullable: true })
  userAgent!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Column({ type: "varchar", length: 128, nullable: true })
  os!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Column({ type: "varchar", length: 128, nullable: true })
  osVersion!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Column({ type: "varchar", length: 64, nullable: true })
  architecture!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Column({ type: "varchar", length: 64, nullable: true })
  dockerVersion!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Column({ type: "varchar", length: 64, nullable: true })
  composeVersion!: string | null;
}
