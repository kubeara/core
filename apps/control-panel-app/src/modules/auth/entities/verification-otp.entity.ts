import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { IsEnum, IsNotEmpty, IsNumber, IsString } from "class-validator";

import { BaseEntity } from "@control-panel/common/entity/base.entity";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";

export enum VerificationType {
  EMAIL_VERIFICATION = "EMAIL_VERIFICATION",
  FORGOT_PASSWORD = "FORGOT_PASSWORD",
  LOGIN_OTP = "LOGIN_OTP",
}

@Entity({ name: "verificationOtps" })
@Index("IDX_verification_otps_userId", ["userId"])
@Index("IDX_verification_otps_type", ["type"])
export class VerificationOtpEntity extends BaseEntity {
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: UserEntity;

  @Column({ type: "uuid" })
  userId!: string;

  @IsEnum(VerificationType)
  @Column({
    type: "enum",
    enum: VerificationType,
    enumName: "verificationTypeEnum",
  })
  type!: VerificationType;

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
