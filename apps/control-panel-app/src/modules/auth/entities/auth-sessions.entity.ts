import { IsNotEmpty, IsNumber, IsString, IsUUID } from "class-validator";
import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../common/entity/base.entity";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";

@Entity({ name: "authSessions" })
@Index("IDX_auth_sessions_userId", ["userId"])
export class AuthSessionsEntity extends BaseEntity {
  @IsUUID()
  @IsNotEmpty()
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: UserEntity;

  @Column({ type: "uuid" })
  userId!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "text", nullable: false })
  accessToken!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "text", nullable: false })
  refreshToken!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "varchar", length: 255, nullable: true })
  ipAddress!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "varchar", length: 255, nullable: true })
  userAgent!: string;

  @IsNumber()
  @IsNotEmpty()
  @Column({ type: "bigint", nullable: false })
  expiresAt!: number;
}
