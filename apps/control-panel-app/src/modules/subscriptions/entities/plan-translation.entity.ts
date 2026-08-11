import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from "typeorm";

import { BaseEntity } from "../../../common/entity/base.entity";
import { PlanEntity } from "./plan.entity";

/**
 * Localized display fields for a subscription plan.
 * One row per (plan, locale) holding the translatable marketing content
 * and feature display strings.
 */
@Entity("planTranslations")
@Unique(["planId", "locale"])
@Index(["planId"])
export class PlanTranslationEntity extends BaseEntity {
  @Column({ type: "uuid" })
  planId!: string;

  @Column({ type: "varchar", length: 16 })
  locale!: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  name!: string | null;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  /**
   * Human-readable feature map for this locale.
   * Keys are localized display labels (e.g. "Teams", "Équipes").
   * Values are the raw structural feature values — numbers, booleans,
   * strings such as "unlimited", "full", or a tier slug for inheritsFrom.
   * Null when the row predates this column.
   */
  @Column({ type: "jsonb", nullable: true })
  features!: Record<string, string | number | boolean> | null;

  @ManyToOne(() => PlanEntity, (plan) => plan.translations, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "planId", referencedColumnName: "id" })
  plan!: PlanEntity;
}
