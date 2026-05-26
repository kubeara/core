import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";

import { EnvironmentVariableEntity } from "./environment-variable.entity";
import { ServiceTemplateEntity } from "../../templates/entities/service-template.entity";
import { ServerEntity } from "@control-panel/modules/server-connections/entities/server.entity";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";
import type { DeploymentStatus } from "@shared/socket-events";

@Entity("serviceDeployments")
export class ServiceDeploymentEntity {
  @PrimaryColumn({ type: "varchar", length: 128 })
  id!: string;

  @Column({ type: "varchar", length: 255 })
  template_slug!: string;

  @Column({ type: "uuid", nullable: true })
  server_id!: string | null;

  @Column({ type: "uuid", nullable: true })
  userId!: string | null;

  @ManyToOne(() => ServerEntity, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "server_id" })
  server?: ServerEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "userId" })
  user?: UserEntity | null;

  @ManyToOne(() => ServiceTemplateEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "template_slug", referencedColumnName: "slug" })
  template?: ServiceTemplateEntity;

  @Column({ type: "varchar", length: 32, default: "pending" })
  status!: DeploymentStatus;

  @Column({ type: "text", nullable: true })
  status_message!: string | null;

  @Column({ type: "text", nullable: true })
  last_error!: string | null;

  @OneToMany(
    () => EnvironmentVariableEntity,
    (variable) => variable.deployment,
    {
      cascade: true,
    },
  )
  environmentVariables?: EnvironmentVariableEntity[];

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at?: Date | null;
}
