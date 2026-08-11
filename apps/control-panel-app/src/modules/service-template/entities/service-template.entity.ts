import { BaseEntity } from "../../../common/entity/base.entity";
import { Column, Entity, OneToMany, PrimaryColumn } from "typeorm";

import { ServiceTemplateTranslationEntity } from "./service-template-translation.entity";

@Entity("serviceTemplates")
export class ServiceTemplateEntity extends BaseEntity {
  @PrimaryColumn({ type: "varchar", length: 255 })
  slug!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ type: "text", nullable: true })
  documentation!: string | null;

  @Column({ type: "text", nullable: true })
  logo!: string | null;

  @Column("text")
  compose!: string;

  @Column("json", { nullable: true })
  envSchema!: Record<string, unknown> | null;

  @Column("json", { nullable: true })
  portSchema!: Record<string, unknown> | null;

  @Column({ type: "integer", nullable: true })
  port!: number | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  version!: string | null;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @OneToMany(
    () => ServiceTemplateTranslationEntity,
    (translation) => translation.serviceTemplate,
  )
  translations?: ServiceTemplateTranslationEntity[];
}
