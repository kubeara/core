import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateMcpApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;
}
