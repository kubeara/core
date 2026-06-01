import { Module } from "@nestjs/common";
import { TemplatePayloadService } from "./template-payload.service";

@Module({
  providers: [TemplatePayloadService],
  exports: [TemplatePayloadService],
})
export class TemplatePayloadModule {}
