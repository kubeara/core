import { IsNotEmpty, IsString, IsUUID } from "class-validator";
import { Column, Entity, Index } from "typeorm";

import { BaseEntity } from "@control-panel/common/entity/base.entity";

@Entity({ name: "mcpOauthRefreshTokens" })
@Index("IDX_mcp_oauth_refresh_tokenHash", ["tokenHash"])
@Index("IDX_mcp_oauth_refresh_userId", ["userId"])
export class McpOAuthRefreshTokenEntity extends BaseEntity {
  @IsString()
  @IsNotEmpty()
  @Column({ type: "text" })
  tokenHash!: string;

  @IsUUID()
  @IsNotEmpty()
  @Column({ type: "uuid" })
  userId!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "text" })
  clientId!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "text" })
  resource!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "text" })
  scopes!: string;

  @Column({ type: "bigint" })
  expiresAt!: number;

  @Column({ type: "bigint", nullable: true })
  revokedAt!: number | null;
}
