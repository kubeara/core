import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class SubmitServiceRequestDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  serviceName!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;
}
