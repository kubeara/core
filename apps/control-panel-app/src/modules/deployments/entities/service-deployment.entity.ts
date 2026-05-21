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
import type { DeploymentStatus } from "@shared/socket-events";
import { ServiceTemplateEntity } from "@control-panel/modules/templates";

@Entity("service_deployments")
export class ServiceDeploymentEntity {
  @PrimaryColumn({ type: "varchar", length: 128 })
  id!: string;

  @Column({ type: "varchar", length: 255 })
  template_slug!: string;

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
  environment_variables?: EnvironmentVariableEntity[];

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at?: Date | null;
}
