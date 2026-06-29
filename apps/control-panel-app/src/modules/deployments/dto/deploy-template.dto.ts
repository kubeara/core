import {
  IsString,
  IsOptional,
  IsObject,
  IsBoolean,
  IsUUID,
} from "class-validator";

export class DeployTemplateDto {
  @IsString()
  templateSlug!: string;

  /**
   * Target server (from `servers` table). Required unless `deployOnLocal` is true.
   */
  @IsOptional()
  @IsUUID()
  serverId?: string;

  /** Deploy on this user's local machine server (created on first use). */
  @IsOptional()
  @IsBoolean()
  deployOnLocal?: boolean;

  /** When provided, reuse this deployment and merge stored env with the request body. */
  @IsOptional()
  @IsString()
  deploymentId?: string;

  @IsOptional()
  @IsObject()
  env?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  ports?: Record<string, unknown>;

  /** When true, route via Traefik (agent TRAEFIK_ENABLED must also be on). */
  @IsOptional()
  @IsBoolean()
  useTraefik?: boolean;
}
