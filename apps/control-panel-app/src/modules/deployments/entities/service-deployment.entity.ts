import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";

import { AuditableEntity } from "@control-panel/common/entity/auditable.entity";
import { EnvironmentVariableEntity } from "./environment-variable.entity";
import { ServiceTemplateEntity } from "../../service-template/entities/service-template.entity";
import { ServerEntity } from "@control-panel/modules/server-connections/entities/server.entity";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";
import { DeploymentStatus } from "@shared/socket-events";

import { DeploymentType } from "../enums/deployment-type.enum";

@Entity("serviceDeployments")
export class ServiceDeploymentEntity extends AuditableEntity {
  @PrimaryColumn({ type: "varchar", length: 128 })
  id!: string;

  @Column({ type: "varchar", length: 255 })
  templateSlug!: string;

  @Column({ type: "uuid", nullable: true })
  serverId!: string | null;

  @Column({ type: "uuid", nullable: true })
  userId!: string | null;

  @ManyToOne(() => ServerEntity, { nullable: true })
  @JoinColumn({ name: "serverId" })
  server?: ServerEntity | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: "userId" })
  user?: UserEntity | null;

  @ManyToOne(() => ServiceTemplateEntity, { nullable: true })
  @JoinColumn({ name: "templateSlug", referencedColumnName: "slug" })
  template?: ServiceTemplateEntity | null;

  @Column({
    type: "varchar",
    length: 32,
    default: DeploymentStatus.PENDING,
  })
  deploymentStatus!: DeploymentStatus;

  @Column({ type: "text", nullable: true })
  statusMessage!: string | null;

  @Column({ type: "text", nullable: true })
  lastError!: string | null;

  @Column({
    type: "varchar",
    length: 32,
    default: DeploymentType.PLATFORM_SERVICE,
  })
  deploymentType!: DeploymentType;

  @Column({ type: "text", nullable: true })
  encryptedComposeContent!: string | null;

  @OneToMany(
    () => EnvironmentVariableEntity,
    (variable) => variable.deployment,
    {
      cascade: true,
    },
  )
  environmentVariables?: EnvironmentVariableEntity[];
}
