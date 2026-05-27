import { PrimaryGeneratedColumn } from "typeorm";
import { IsUUID } from "class-validator";

import { AuditableEntity } from "./auditable.entity";

export { EntityStatus } from "./entity-status";

/**
 * UUID primary key plus standard auditable columns.
 */
export abstract class BaseEntity extends AuditableEntity {
  @IsUUID()
  @PrimaryGeneratedColumn("uuid")
  id!: string;
}
