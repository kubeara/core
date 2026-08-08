import { Column, Entity, OneToMany } from "typeorm";
import { BaseEntity } from "@control-panel/common/entity/base.entity";
import { BillingCycleSlug } from "../enums/billing-cycle.enum";
import { PlanSlug } from "../enums/plan-slug.enum";
import { PlanTranslationEntity } from "./plan-translation.entity";

@Entity({ name: "plans" })
export class PlanEntity extends BaseEntity {
  @Column({ type: "varchar", length: 50, unique: true })
  slug!: PlanSlug;

  @Column({ type: "varchar", length: 20 })
  tierSlug!: string;

  @Column({ type: "varchar", length: 20, default: BillingCycleSlug.MONTHLY })
  billingCycle!: BillingCycleSlug;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  price!: number;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  listPrice!: number | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  stripePriceId!: string | null;

  @Column({ type: "int", default: 0 })
  sortOrder!: number;

  @OneToMany(() => PlanTranslationEntity, (translation) => translation.plan)
  translations?: PlanTranslationEntity[];
}
