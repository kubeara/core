import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Repository } from "typeorm";

import { EntityStatus } from "@control-panel/common/entity/base.entity";

import { LOCAL_SERVER } from "../constants/local-server.constants";
import { ServerEntity } from "../entities/server.entity";
import { ServerType } from "../enums/server-type.enum";
import { AgentServerBindingService } from "./agent-server-binding.service";

describe("AgentServerBindingService", () => {
  let service: AgentServerBindingService;
  let serverRepository: jest.Mocked<
    Pick<Repository<ServerEntity>, "findOne" | "find">
  >;

  beforeEach(() => {
    serverRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    service = new AgentServerBindingService(
      serverRepository as unknown as Repository<ServerEntity>,
    );
  });

  it("uses install-written server id when present", async () => {
    serverRepository.findOne.mockResolvedValue({
      id: "server-install",
    } as ServerEntity);

    const result = await service.resolveServerIdForAgent({
      explicitServerId: "server-install",
      reportedPublicIp: "203.0.113.1",
    });

    expect(result).toBe("server-install");
  });

  it("matches by public IP to servers.host", async () => {
    serverRepository.findOne.mockResolvedValue(null);
    serverRepository.find.mockResolvedValue([
      {
        id: "server-vps",
        host: "203.0.113.10",
        serverType: ServerType.VIRTUAL_MACHINE,
        status: EntityStatus.ACTIVE,
      } as ServerEntity,
    ]);

    const result = await service.resolveServerIdForAgent({
      reportedPublicIp: "203.0.113.10",
    });

    expect(result).toBe("server-vps");
  });

  it("falls back to local server for loopback agents when exactly one exists", async () => {
    serverRepository.findOne.mockResolvedValue(null);
    serverRepository.find.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "server-local",
        host: LOCAL_SERVER.HOST,
        serverType: ServerType.LOCAL,
        status: EntityStatus.ACTIVE,
      } as ServerEntity,
    ]);

    const result = await service.resolveServerIdForAgent({
      reportedPublicIp: "127.0.0.1",
    });

    expect(result).toBe("server-local");
  });
});
