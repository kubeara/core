import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from "typeorm";
import { BaseEntity } from "../../../common/entity/base.entity";
import { OrganizationEntity } from "@control-panel/modules/organizations/entities/organization.entity";
import { Exclude } from "class-transformer";

@Entity({ name: "users" })
@Index("IDX_users_email", ["email"])
@Unique("UQ_users_email", ["email"])
export class UserEntity extends BaseEntity {
  @IsUUID()
  @IsNotEmpty()
  @ManyToOne(() => OrganizationEntity)
  @JoinColumn({ name: "organizationId" })
  organization!: OrganizationEntity;

  @Column({ type: "uuid" })
  organizationId!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "varchar", length: 255 })
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "varchar", length: 255 })
  email!: string;

  @Exclude()
  @IsString()
  @IsNotEmpty()
  @Column({ type: "text" })
  passwordHash!: string;

  @IsString()
  @IsOptional()
  @Column({ type: "varchar", nullable: true })
  profilePictureUrl!: string;

  @IsNumber()
  @IsOptional()
  @Column({ type: "bigint", nullable: true })
  dateOfBirth!: number;

  @IsNumber()
  @IsOptional()
  @Column({ type: "bigint", nullable: false })
  signUpAt!: number;

  @IsNumber()
  @IsOptional()
  @Column({ type: "bigint", nullable: true })
  lastLoginAt!: number;

  @IsNumber()
  @IsOptional()
  @Column({ type: "bigint", nullable: true })
  lastPasswordResetAt!: number;

  @IsBoolean()
  @Column({ type: "boolean" })
  isEmailVerified!: boolean;

  @IsNumber()
  @IsOptional()
  @Column({ type: "bigint", nullable: true })
  emailVerifiedAt!: number;
}
