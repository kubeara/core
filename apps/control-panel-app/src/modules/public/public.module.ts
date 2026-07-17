import { Module } from "@nestjs/common";

import { KubearaPublicOriginGuard } from "@control-panel/common/guards/kubeara-public-origin.guard";
import { ServiceTemplateModule } from "@control-panel/modules/service-template/service-template.module";

import { SupportController } from "./controllers/public-support.controller";
import { TemplatesController } from "./controllers/public-templates.controller";
import { ZohoDeskService } from "./services/zoho-desk.service";

@Module({
  imports: [ServiceTemplateModule],
  controllers: [TemplatesController, SupportController],
  providers: [KubearaPublicOriginGuard, ZohoDeskService],
})
export class PublicModule {}
