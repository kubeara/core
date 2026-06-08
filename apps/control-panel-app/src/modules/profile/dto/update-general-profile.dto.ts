import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class UpdateGeneralProfileDto {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsString()
  profilePicture?: string | null;
}
