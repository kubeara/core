import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";

import { BaseEntity } from "@control-panel/common/entity/base.entity";
import { ServerEntity } from "@control-panel/modules/server-connections/entities/server.entity";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";
import { DeploymentStatus } from "@shared/socket-events";

import { ActivityType } from "../enums/activity-type.enum";

/**
 * One row per user-visible action on a server.
 *
 * BaseEntity also provides: id, status, metadata, createdAt, updatedAt, deletedAt.
 */
@Entity({ name: "activities" })
@Index("IDX_activities_userId", ["userId"])
@Index("IDX_activities_serverId", ["serverId"])
export class ActivityEntity extends BaseEntity {
  @IsUUID()
  @Column({ type: "uuid" })
  userId!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: "userId" })
  user?: UserEntity;

  @IsUUID()
  @Column({ type: "uuid" })
  serverId!: string;

  @ManyToOne(() => ServerEntity)
  @JoinColumn({ name: "serverId" })
  server?: ServerEntity;

  @IsEnum(ActivityType)
  @Column({ type: "varchar", length: 64 })
  type!: ActivityType;

  @IsString()
  @Column({ type: "varchar", length: 255 })
  title!: string;

  @IsOptional()
  @IsString()
  @Column({ type: "text", nullable: true })
  message!: string | null;

  @IsEnum(DeploymentStatus)
  @Column({ type: "varchar", length: 32, default: DeploymentStatus.PENDING })
  operationStatus!: DeploymentStatus;

  @IsOptional()
  @IsString()
  @Column({ type: "varchar", length: 128, nullable: true })
  deploymentId!: string | null;

  @IsOptional()
  @IsString()
  @Column({ type: "varchar", length: 255, nullable: true })
  templateSlug!: string | null;
}
