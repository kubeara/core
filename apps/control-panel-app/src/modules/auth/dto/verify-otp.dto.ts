import { IsEmail, IsEnum, IsString, Length } from "class-validator";
import { CODE_TYPE } from "../enum/codeType.enum";

export class VerifyOtpDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  otp!: string;

  @IsEnum(CODE_TYPE)
  codeType!: CODE_TYPE;
}
