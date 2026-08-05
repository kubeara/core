import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { EntityStatus } from "@control-panel/common/entity/entity-status";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { toErrorMessage } from "@control-panel/common/utils/error.util";

import { PUBLIC_MESSAGES } from "../constants/public-messages.constants";
import { RecordInstallationEventDto } from "../dto/record-installation-event.dto";
import { SelfHostInstallationEntity } from "../entities/self-host-installation.entity";
import { InstallationEventType } from "../enums/installation-event-type.enum";

@Injectable()
export class SelfHostInstallationService {
  private readonly logger = new Logger(SelfHostInstallationService.name);

  constructor(
    @InjectRepository(SelfHostInstallationEntity)
    private readonly selfHostInstallationRepository: Repository<SelfHostInstallationEntity>,
  ) {}

  /**
   * Persist a self-hosted installation lifecycle event.
   *
   * @param input - Installer-supplied event payload (no client IP).
   * @param ipAddress - Client IP derived from the incoming request.
   */
  async recordEvent(
    input: RecordInstallationEventDto,
    ipAddress: string,
  ): Promise<ServiceResponse<{ id: string }>> {
    try {
      const previousVersion =
        input.eventType === InstallationEventType.UPGRADE
          ? (input.previousVersion ?? null)
          : null;

      const event = this.selfHostInstallationRepository.create({
        installationId: input.installationId,
        eventType: input.eventType,
        version: input.version,
        previousVersion,
        ipAddress,
        userAgent: input.userAgent ?? null,
        os: input.os ?? null,
        osVersion: input.osVersion ?? null,
        architecture: input.architecture ?? null,
        dockerVersion: input.dockerVersion ?? null,
        composeVersion: input.composeVersion ?? null,
        status: EntityStatus.ACTIVE,
      });

      const saved = await this.selfHostInstallationRepository.save(event);

      return {
        message: PUBLIC_MESSAGES.INSTALLATION.EVENT_RECORDED,
        data: { id: saved.id },
      };
    } catch (error) {
      this.logger.error(
        `Failed to record installation event for '${input.installationId}': ${toErrorMessage(error)}`,
      );

      throw new InternalServerErrorException(
        "Unable to record the installation event. Please try again later.",
      );
    }
  }
}
