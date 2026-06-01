import { IsString, IsOptional, IsObject, IsUUID } from "class-validator";

export class DeployTemplateDto {
  @IsString()
  templateSlug!: string;

  /** Target server (from `servers` table). When omitted, the local machine server is used. */
  @IsOptional()
  @IsUUID()
  serverId?: string;

  @IsOptional()
  @IsObject()
  env?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  ports?: Record<string, unknown>;
}
