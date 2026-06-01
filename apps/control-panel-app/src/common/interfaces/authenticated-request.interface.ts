import { UserEntity } from "@control-panel/modules/users/entities/users.entity";

export interface AuthenticatedRequest {
  user: UserEntity;
}
