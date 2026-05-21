import { ServerSshAuthType } from "../enums/server-ssh-auth-type.enum";

export interface CreateServerWithCredentialsResponseDto {
  server: {
    id: string;
    name: string;
    host: string;
  };
  credentials?: {
    id: string;
    authType: ServerSshAuthType;
    username: string;
  };
}
