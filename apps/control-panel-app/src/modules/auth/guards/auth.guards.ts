import { AuthGuard } from "@nestjs/passport";

export class AccessTokenGuard extends AuthGuard("jwt") {}

export class RefreshTokenGuard extends AuthGuard("jwt-refresh") {}
