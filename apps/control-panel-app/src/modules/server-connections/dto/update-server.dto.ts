import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import { SERVER_NAME_MAX_LENGTH } from "../server-connections.constants";

export class UpdateServerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(SERVER_NAME_MAX_LENGTH)
  name?: string;
}
