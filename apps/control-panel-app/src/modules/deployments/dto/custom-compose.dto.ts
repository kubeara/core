import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class ValidateCustomComposeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(262_144)
  composeYaml!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(262_144)
  envFileContent?: string;
}

export class DeployCustomComposeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(262_144)
  composeYaml!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  displayName!: string;

  @IsOptional()
  @IsUUID()
  serverId?: string;

  @IsOptional()
  @IsBoolean()
  deployOnLocal?: boolean;

  @IsOptional()
  @IsString()
  deploymentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(262_144)
  envFileContent?: string;

  @IsOptional()
  @IsObject()
  env?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  ports?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  useTraefik?: boolean;
}
