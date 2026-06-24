import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";
import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";

import { BaseEntity } from "../../../common/entity/base.entity";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";

@Entity({ name: "mcpApiKeys" })
@Index("IDX_mcp_api_keys_userId", ["userId"])
@Index("IDX_mcp_api_keys_keyHash", ["keyHash"])
export class McpApiKeyEntity extends BaseEntity {
  @IsUUID()
  @IsNotEmpty()
  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: "userId" })
  user!: UserEntity;

  @Column({ type: "uuid" })
  userId!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "text" })
  keyHash!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "varchar", length: 255 })
  name!: string;

  @IsNumber()
  @IsOptional()
  @Column({ type: "bigint", nullable: true })
  lastUsedAt!: number | null;

  @IsNumber()
  @IsOptional()
  @Column({ type: "bigint", nullable: true })
  revokedAt!: number | null;
}
