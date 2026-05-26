import { IsNotEmpty, IsString } from "class-validator";
import { Column, Entity } from "typeorm";
import { BaseEntity } from "../../../common/entity/base.entity";

@Entity({ name: "organizations" })
export class OrganizationEntity extends BaseEntity {
  @IsString()
  @IsNotEmpty()
  @Column({ type: "varchar", length: 255 })
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "varchar", nullable: true })
  logo!: string;
}
