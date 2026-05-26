import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from "typeorm";

import { ServiceDeploymentEntity } from "./service-deployment.entity";

@Entity("environmentVariables")
@Unique(["deployment_id", "key"])
@Index(["deployment_id"])
export class EnvironmentVariableEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 128 })
  deployment_id!: string;

  @ManyToOne(
    () => ServiceDeploymentEntity,
    (deployment) => deployment.environmentVariables,
  )
  @JoinColumn({ name: "deployment_id" })
  deployment!: ServiceDeploymentEntity;

  @Column({ type: "varchar", length: 255 })
  key!: string;

  /** AES-256-GCM encrypted value (same format as EncryptionService) */
  @Column({ type: "text" })
  value!: string;

  @Column({ type: "boolean", default: false })
  is_required!: boolean;

  /** True when Coolify-style SERVICE_* value was auto-generated */
  @Column({ type: "boolean", default: false })
  is_generated!: boolean;

  @Column({ type: "text", nullable: true })
  comment!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
