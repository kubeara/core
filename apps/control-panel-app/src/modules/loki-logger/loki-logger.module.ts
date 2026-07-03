import { Global, Module } from "@nestjs/common";

import { LokiLoggerService } from "./loki-logger.service";

@Global()
@Module({
  providers: [LokiLoggerService],
  exports: [LokiLoggerService],
})
export class LokiLoggerModule {}
