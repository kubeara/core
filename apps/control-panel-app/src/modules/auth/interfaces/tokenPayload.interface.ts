import { tokenType } from "../enum/tokenType.enum";

export interface TokenPayload {
  sub: string;
  email: string;
  tokenType?: tokenType;
}
