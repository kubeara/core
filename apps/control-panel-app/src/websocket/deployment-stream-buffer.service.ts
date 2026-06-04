import { Injectable } from "@nestjs/common";
import type { DeploymentLogStreamPayload } from "@shared/socket-events";

const MAX_LINES_PER_DEPLOYMENT = 5000;

/**
 * In-memory log ring buffer per deployment. Replayed when a console client
 * joins the deployment room (logs:subscribe) after deploy/install already ran.
 */
@Injectable()
export class DeploymentStreamBufferService {
  private readonly buffers = new Map<string, DeploymentLogStreamPayload[]>();

  append(payload: DeploymentLogStreamPayload): void {
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
  }

  get(deploymentId: string): DeploymentLogStreamPayload[] {
    const id = deploymentId.trim();
    if (!id) {
      return [];
    }
    return [...(this.buffers.get(id) ?? [])];
  }

  clear(deploymentId: string): void {
    const id = deploymentId.trim();
    if (id) {
      this.buffers.delete(id);
    }
  }
}
