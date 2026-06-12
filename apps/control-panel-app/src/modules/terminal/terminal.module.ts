import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WebsocketModule } from "@control-panel/websocket/websocket.module";
import { ServerEntity } from "@control-panel/modules/server-connections/entities/server.entity";
import { ServerSshCredentialEntity } from "@control-panel/modules/server-connections/entities/server-ssh-credential.entity";
import { SshModule } from "@shared/ssh";
import { TerminalController } from "./terminal.controller";
import { TerminalService } from "./terminal.service";
import { SshTerminalService } from "./ssh-terminal.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ServerEntity, ServerSshCredentialEntity]),
    SshModule,
    forwardRef(() => WebsocketModule),
  ],
  controllers: [TerminalController],
  providers: [TerminalService, SshTerminalService],
  exports: [SshTerminalService],
})
export class TerminalModule {}
