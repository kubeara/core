import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";
import { OrganizationEntity } from "@control-panel/modules/organizations/entities/organization.entity";
import { AuthSessionsEntity } from "./entities/auth-sessions.entity";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { VerificationOtpEntity } from "./entities/verification-otp.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      OrganizationEntity,
      AuthSessionsEntity,
      VerificationOtpEntity,
    ]),
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: "1h",
        },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
