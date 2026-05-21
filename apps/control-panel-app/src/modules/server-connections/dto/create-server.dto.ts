import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { EntityStatus } from "../../../common/entity/base.entity";
import { ServerProvider } from "../enums/server-provider.enum";
import { ServerType } from "../enums/server-type.enum";

export class CreateServerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  host!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsEnum(ServerProvider)
  provider?: ServerProvider;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  operatingSystem?: string;

  @IsOptional()
  @IsEnum(ServerType)
  serverType?: ServerType;

  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
