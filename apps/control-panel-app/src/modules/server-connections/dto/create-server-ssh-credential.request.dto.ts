import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from "class-validator";
import { ServerSshAuthType } from "../enums/server-ssh-auth-type.enum";

/**
 * Incoming request DTO for adding SSH credentials.
 * Accepts raw plaintext credentials (password or private key) which
 * will be encrypted before persisting to the database.
 */
export class CreateServerSshCredentialRequestDto {
  @IsEnum(ServerSshAuthType)
  authType!: ServerSshAuthType;

  @ValidateIf(
    (dto: CreateServerSshCredentialRequestDto) =>
      dto.authType === ServerSshAuthType.PASSWORD,
  )
  @IsString()
  @IsNotEmpty()
  password?: string;

  @IsOptional()
  @IsString()
  privateKey?: string;

  @IsOptional()
  @IsString()
  privateKeyPassphrase?: string;

  @IsOptional()
  @IsString()
  sshFingerprint?: string;
}
