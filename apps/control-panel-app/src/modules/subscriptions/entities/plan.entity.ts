import { Column, Entity } from "typeorm";
import { BaseEntity } from "@control-panel/common/entity/base.entity";
import { PlanSlug } from "../enums/plan-slug.enum";
import { PlanFeatures } from "../interfaces/plan-features.interface";

@Entity({ name: "plans" })
export class PlanEntity extends BaseEntity {
  @Column({ type: "varchar", length: 50, unique: true })
  slug!: PlanSlug;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "int", default: 0 })
  priceMonthly!: number;

  @Column({ type: "varchar", length: 255, nullable: true })
  stripePriceId!: string | null;

  @Column({ type: "jsonb", default: {} })
  features!: PlanFeatures;

  @Column({ type: "int", default: 0 })
  sortOrder!: number;
}
