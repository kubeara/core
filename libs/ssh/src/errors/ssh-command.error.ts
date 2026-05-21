import { BadRequestException } from "@nestjs/common";

export class SshCommandError extends BadRequestException {
  constructor(message?: string) {
    super(message ?? "SSH command failed");
  }
}
