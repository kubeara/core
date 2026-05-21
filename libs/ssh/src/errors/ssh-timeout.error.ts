import { RequestTimeoutException } from "@nestjs/common";

export class SshTimeoutError extends RequestTimeoutException {
  constructor(message?: string) {
    super(message ?? "SSH operation timed out");
  }
}
