import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { StringValue } from "ms";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";
import { OrganizationEntity } from "@control-panel/modules/organizations/entities/organization.entity";
import { AuthSessionsEntity } from "./entities/auth-sessions.entity";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { RefreshJwtStrategy } from "./strategies/refresh-jwt.strategy";
import { UserCodeEntity } from "./entities/user-codes.entity";
import { UsersModule } from "../users/users.module";
import { AuthCookieService } from "./services/auth-cookie.service";
import { AuthSessionLookupService } from "./services/auth-session-lookup.service";

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([
      UserEntity,
      OrganizationEntity,
      AuthSessionsEntity,
      UserCodeEntity,
    ]),
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: configService.getOrThrow<StringValue>(
            "ACCESS_TOKEN_EXPIRES_IN",
          ),
        },
      }),
    }),
  ],
  providers: [
    AuthService,
    AuthCookieService,
    AuthSessionLookupService,
    JwtStrategy,
    RefreshJwtStrategy,
  ],
  controllers: [AuthController],
  exports: [AuthService, AuthCookieService],
})
export class AuthModule {}
