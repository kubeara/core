import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { KubearaPublicOriginGuard } from "@control-panel/common/guards/kubeara-public-origin.guard";
import { ServiceTemplateModule } from "@control-panel/modules/service-template/service-template.module";

import { InstallationsController } from "./controllers/public-installations.controller";
import { SupportController } from "./controllers/public-support.controller";
import { TemplatesController } from "./controllers/public-templates.controller";
import { SelfHostInstallationEntity } from "./entities/self-host-installation.entity";
import { SelfHostInstallationService } from "./services/self-host-installation.service";
import { ZohoDeskService } from "./services/zoho-desk.service";

@Module({
  imports: [
    ServiceTemplateModule,
    TypeOrmModule.forFeature([SelfHostInstallationEntity]),
  ],
  controllers: [
    TemplatesController,
    SupportController,
    InstallationsController,
  ],
  providers: [
    KubearaPublicOriginGuard,
    ZohoDeskService,
    SelfHostInstallationService,
  ],
})
export class PublicModule {}
