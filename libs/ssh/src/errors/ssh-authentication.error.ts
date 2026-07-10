import { BadRequestException } from "@nestjs/common";

export function isSshAuthenticationFailure(message: string): boolean {
  const msg = message.toLowerCase();

  return (
    msg.includes("permission denied") ||
    msg.includes("authentication failed") ||
    msg.includes("all configured authentication methods failed") ||
    msg.includes("no supported authentication methods") ||
    msg.includes("userauth failure")
  );
}

export class SshAuthenticationError extends BadRequestException {
  constructor(message?: string) {
    super(message ?? "SSH authentication failed");
  }
}
