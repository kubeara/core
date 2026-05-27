import { IsBoolean, IsOptional, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { CreateServerDto } from "./create-server.dto";
import { CreateServerSshCredentialRequestDto } from "./create-server-ssh-credential.request.dto";

export class CreateServerOnboardRequestDto {
  @ValidateNested()
  @Type(() => CreateServerDto)
  server!: CreateServerDto;

  @ValidateNested()
  @Type(() => CreateServerSshCredentialRequestDto)
  ssh!: CreateServerSshCredentialRequestDto;

  /** When true (default), install kubeara/agent on the server after SSH succeeds. */
  @IsOptional()
  @IsBoolean()
  installAgent?: boolean;
}
