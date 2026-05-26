import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { IsEnum, IsNotEmpty, IsNumber, IsString } from "class-validator";

import { BaseEntity } from "@control-panel/common/entity/base.entity";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";
import { CODE_TYPE } from "../enum/codeType.enum";

@Entity({ name: "userCodes" })
@Index("IDX_verification_otps_userId", ["userId"])
export class UserCodeEntity extends BaseEntity {
  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: "userId" })
  user!: UserEntity;

  @Column({ type: "uuid" })
  userId!: string;

  @IsEnum(CODE_TYPE)
  @Column({
    type: "enum",
    enum: CODE_TYPE,
    enumName: "verificationTypeEnum",
  })
  codeType!: CODE_TYPE;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "text" })
  otpHash!: string;

  @IsNumber()
  @Column({ type: "bigint" })
  expiresAt!: number;

  @IsNumber()
  @Column({ type: "int", default: 0 })
  attempts!: number;

  @Column({ type: "bigint", nullable: true })
  verifiedAt!: number | null;
}
