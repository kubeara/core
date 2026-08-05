import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from "class-validator";

import { InstallationEventType } from "../enums/installation-event-type.enum";

export class RecordInstallationEventDto {
  @IsUUID()
  installationId!: string;

  @IsEnum(InstallationEventType)
  eventType!: InstallationEventType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  version!: string;

  @ValidateIf(
    (dto: RecordInstallationEventDto) =>
      dto.eventType === InstallationEventType.UPGRADE,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  previousVersion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  os?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  osVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  architecture?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  dockerVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  composeVersion?: string;
}
