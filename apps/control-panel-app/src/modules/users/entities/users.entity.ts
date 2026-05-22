import { IsNotEmpty, IsString } from "class-validator";
import { Column, Entity, Index, Unique } from "typeorm";
import { BaseEntity } from "../../../common/entity/base.entity";

@Entity({ name: "authSessions" })
@Index("IDX_users_email", ["email"])
@Unique("UQ_users_email", ["email"])
export class UserEntity extends BaseEntity {
  @IsString()
  @IsNotEmpty()
  @Column({ type: "varchar", length: 255 })
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "varchar", length: 255 })
  email!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "text" })
  passwordHash!: string;
}
