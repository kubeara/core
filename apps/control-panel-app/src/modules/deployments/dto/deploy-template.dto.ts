import { IsString, IsOptional, IsObject, IsBoolean } from "class-validator";

export class DeployTemplateDto {
  @IsString()
  templateSlug!: string;

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
