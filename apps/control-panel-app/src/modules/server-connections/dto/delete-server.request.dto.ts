import { IsBoolean, IsOptional } from "class-validator";

export class DeleteServerRequestDto {
  @IsOptional()
  @IsBoolean()
  removeManagedServices?: boolean;
}
