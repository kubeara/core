import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';
import { EntityStatus } from '../../../common/entity/base.entity';
import { ServerSshAuthType } from '../enums/server-ssh-auth-type.enum';

export class CreateServerSshCredentialDto {
    @IsUUID()
    serverId!: string;

    @IsEnum(ServerSshAuthType)
    authType!: ServerSshAuthType;

    @IsString()
    @IsNotEmpty()
    username!: string;

    @ValidateIf((dto: CreateServerSshCredentialDto) => dto.authType === ServerSshAuthType.PRIVATE_KEY)
    @IsString()
    @IsNotEmpty()
    encryptedPrivateKey?: string;

    @IsOptional()
    @IsString()
    privateKeyPassphrase?: string;

    @ValidateIf((dto: CreateServerSshCredentialDto) => dto.authType === ServerSshAuthType.PASSWORD)
    @IsString()
    @IsNotEmpty()
    encryptedPassword?: string;

    @IsOptional()
    @IsString()
    sshFingerprint?: string;

    @IsOptional()
    @IsEnum(EntityStatus)
    status?: EntityStatus;

    @IsOptional()
    @IsObject()
    metadata?: Record<string, unknown>;
}
