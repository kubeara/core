import { IsObject, IsOptional } from "class-validator";
import { Type } from "class-transformer";

export class UpdateEnvironmentVariablesDto {
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  env?: Record<string, string | number | boolean>;

  @IsOptional()
  @IsObject()
  @Type(() => Object)
  ports?: Record<string, string | number>;
}
