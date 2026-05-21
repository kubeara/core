import { IsString, IsOptional, IsObject } from "class-validator";

export class DeployTemplateDto {
  @IsString()
  templateSlug!: string;

  @IsOptional()
  @IsObject()
  env?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  ports?: Record<string, unknown>;
}
