import { EntityStatus } from '../../../common/entity/base.entity';
import { ServerSshAuthType } from '../enums/server-ssh-auth-type.enum';

export interface ServerSshCredentialResponseDto {
    id: string;
    serverId: string;
    status: EntityStatus;
    metadata: Record<string, unknown> | null;
    authType: ServerSshAuthType;
    username: string;
    sshFingerprint: string | null;
    createdAt: number;
    updatedAt: number;
    deletedAt: number | null;
}
