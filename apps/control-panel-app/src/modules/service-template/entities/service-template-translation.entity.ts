import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from "typeorm";

import { BaseEntity } from "../../../common/entity/base.entity";
import { ServiceTemplateEntity } from "./service-template.entity";

/**
 * Localized marketing fields for a service template.
 * One row per (template, locale) holding the translatable catalog content.
 */
@Entity("serviceTemplateTranslations")
@Unique(["serviceTemplateId", "locale"])
@Index(["serviceTemplateId"])
export class ServiceTemplateTranslationEntity extends BaseEntity {
  @Column({ type: "uuid" })
  serviceTemplateId!: string;

  @Column({ type: "varchar", length: 16 })
  locale!: string;

  @Column("text", { array: true, nullable: true })
  category!: string[] | null;

  @Column("text", { array: true, nullable: true })
  tags!: string[] | null;

  @Column({ type: "text", nullable: true })
  shortDescription!: string | null;

  @Column({ type: "text", nullable: true })
  longDescription!: string | null;

  @ManyToOne(() => ServiceTemplateEntity, (template) => template.translations, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "serviceTemplateId", referencedColumnName: "id" })
  serviceTemplate!: ServiceTemplateEntity;
}
