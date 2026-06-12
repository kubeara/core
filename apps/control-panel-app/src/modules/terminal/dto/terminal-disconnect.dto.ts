import { IsNotEmpty, IsString } from "class-validator";

export class TerminalDisconnectDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;
}
