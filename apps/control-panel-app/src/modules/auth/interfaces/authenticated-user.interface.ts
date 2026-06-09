import { UserEntity } from "@control-panel/modules/users/entities/users.entity";

export interface AuthenticatedUser extends UserEntity {
  accessToken: string;
}
