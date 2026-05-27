import { BeforeInsert, BeforeSoftRemove, BeforeUpdate, Column } from "typeorm";
import { IsEnum, IsOptional } from "class-validator";
import dayjs from "dayjs";

import { EntityStatus } from "./entity-status";

/**
 * Shared lifecycle columns for all tables (camelCase).
 * Use {@link BaseEntity} when the row has a UUID `id`; extend this directly for custom primary keys.
 */
export abstract class AuditableEntity {
  @IsEnum(EntityStatus)
  @Column({
    type: "varchar",
    length: 50,
    default: EntityStatus.ACTIVE,
  })
  status!: EntityStatus;

  @IsOptional()
  @Column({
    type: "jsonb",
    nullable: true,
  })
  metadata!: Record<string, unknown> | null;

  @Column({ type: "bigint" })
  createdAt!: number;

  @Column({ type: "bigint" })
  updatedAt!: number;

  @Column({ type: "bigint", nullable: true })
  deletedAt!: number | null;

  @BeforeInsert()
  setCreatedAt(): void {
    const now = dayjs().unix();
    this.createdAt = now;
    this.updatedAt = now;
  }

  @BeforeUpdate()
  setUpdatedAt(): void {
    this.updatedAt = dayjs().unix();
  }

  @BeforeSoftRemove()
  setDeletedAt(): void {
    this.deletedAt = dayjs().unix();
    this.status = EntityStatus.INACTIVE;
  }
}
