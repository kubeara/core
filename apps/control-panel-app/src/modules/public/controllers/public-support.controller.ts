import { Body, Controller, Logger, Post, UseGuards } from "@nestjs/common";

import { KubearaPublicOriginGuard } from "@control-panel/common/guards/kubeara-public-origin.guard";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { SubmitServiceRequestDto } from "../dto/submit-service-request.dto";
import { SubmitSupportRequestDto } from "../dto/submit-support-request.dto";
import { ZohoDeskService } from "../services/zoho-desk.service";

@UseGuards(KubearaPublicOriginGuard)
@Controller("public")
export class SupportController {
  private readonly logger = new Logger(SupportController.name);

  constructor(private readonly zohoDeskService: ZohoDeskService) {}

  /**
   * Submit a support request to Zoho Desk.
   */
  @Post("support")
  async submitSupportRequest(
    @Body() submitSupportRequestDto: SubmitSupportRequestDto,
  ): Promise<ServiceResponse<null>> {
    try {
      return await this.zohoDeskService.submitSupportRequest(
        submitSupportRequestDto,
      );
    } catch (error) {
      this.logger.error(
        `Submit support request failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Submit a service request to Zoho Desk.
   */
  @Post("service-requests")
  async submitServiceRequest(
    @Body() submitServiceRequestDto: SubmitServiceRequestDto,
  ): Promise<ServiceResponse<null>> {
    try {
      return await this.zohoDeskService.submitServiceRequest(
        submitServiceRequestDto,
      );
    } catch (error) {
      this.logger.error(
        `Submit service request failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }
}
