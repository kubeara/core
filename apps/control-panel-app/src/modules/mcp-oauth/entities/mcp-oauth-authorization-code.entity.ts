import { IsNotEmpty, IsString, IsUUID } from "class-validator";
import { Column, Entity, Index } from "typeorm";

import { BaseEntity } from "@control-panel/common/entity/base.entity";

@Entity({ name: "mcpOauthAuthorizationCodes" })
@Index("IDX_mcp_oauth_codes_codeHash", ["codeHash"])
export class McpOAuthAuthorizationCodeEntity extends BaseEntity {
  @IsString()
  @IsNotEmpty()
  @Column({ type: "text" })
  codeHash!: string;

  @IsUUID()
  @IsNotEmpty()
  @Column({ type: "uuid" })
  userId!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "text" })
  codeChallenge!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "varchar", length: 16 })
  codeChallengeMethod!: string;

  @IsString()
  @IsNotEmpty()
  @Column({ type: "text" })
  redirectUri!: string;

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
  usedAt!: number | null;
}
