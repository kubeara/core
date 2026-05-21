import { IsOptional, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { CreateServerDto } from "./create-server.dto";
import { CreateServerSshCredentialRequestDto } from "./create-server-ssh-credential.request.dto";

/**
 * Request DTO for creating a server and optionally attaching SSH credentials.
 * Server fields are specified at the top level; when `credentials` is present
 * the nested DTO performs validation of required fields.
 */
export class CreateServerWithCredentialsRequestDto extends CreateServerDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateServerSshCredentialRequestDto)
  credentials?: CreateServerSshCredentialRequestDto;
}
