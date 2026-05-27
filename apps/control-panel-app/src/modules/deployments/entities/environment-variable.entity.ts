import { Entity, Column, ManyToOne, JoinColumn, Unique, Index } from "typeorm";

import { BaseEntity } from "@control-panel/common/entity/base.entity";
import { ServiceDeploymentEntity } from "./service-deployment.entity";

@Entity("environmentVariables")
@Unique(["deploymentId", "key"])
@Index(["deploymentId"])
export class EnvironmentVariableEntity extends BaseEntity {
  @Column({ type: "varchar", length: 128 })
  deploymentId!: string;

  @ManyToOne(
    () => ServiceDeploymentEntity,
    (deployment) => deployment.environmentVariables,
  )
  @JoinColumn({ name: "deploymentId" })
  deployment!: ServiceDeploymentEntity;

  @Column({ type: "varchar", length: 255 })
  key!: string;

  /** AES-256-GCM encrypted value (same format as EncryptionService) */
  @Column({ type: "text" })
  value!: string;

  @Column({ type: "boolean", default: false })
  isRequired!: boolean;

  /** True when Coolify-style SERVICE_* value was auto-generated */
  @Column({ type: "boolean", default: false })
  isGenerated!: boolean;

  @Column({ type: "text", nullable: true })
  comment!: string | null;
}
