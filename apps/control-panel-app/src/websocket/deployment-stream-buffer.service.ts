import { Injectable, Logger } from "@nestjs/common";
import type { DeploymentLogStreamPayload } from "@shared/socket-events";
import { toErrorMessage } from "@control-panel/common/utils/error.util";

const MAX_LINES_PER_DEPLOYMENT = 5000;

/**
 * In-memory log ring buffer per deployment. Replayed when a console client
 * joins the deployment room (logs:subscribe) after deploy/install already ran.
 */
@Injectable()
export class DeploymentStreamBufferService {
  private readonly logger = new Logger(DeploymentStreamBufferService.name);
  private readonly buffers = new Map<string, DeploymentLogStreamPayload[]>();

  append(payload: DeploymentLogStreamPayload): void {
    try {
      const deploymentId = payload.deploymentId?.trim();
      if (!deploymentId) {
        return;
      }

      let buffer = this.buffers.get(deploymentId);
      if (!buffer) {
        buffer = [];
        this.buffers.set(deploymentId, buffer);
      }

      buffer.push(payload);
      if (buffer.length > MAX_LINES_PER_DEPLOYMENT) {
        buffer.splice(0, buffer.length - MAX_LINES_PER_DEPLOYMENT);
      }
    } catch (error) {
      this.logger.error(
        `Append deployment stream buffer failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  get(deploymentId: string): DeploymentLogStreamPayload[] {
    try {
      const id = deploymentId.trim();
      if (!id) {
        return [];
      }
      return [...(this.buffers.get(id) ?? [])];
    } catch (error) {
      this.logger.error(
        `Get deployment stream buffer failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  clear(deploymentId: string): void {
    try {
      const id = deploymentId.trim();
      if (id) {
        this.buffers.delete(id);
      }
    } catch (error) {
      this.logger.error(
        `Clear deployment stream buffer failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }
}
