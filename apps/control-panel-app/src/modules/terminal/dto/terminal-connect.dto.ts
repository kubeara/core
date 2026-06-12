import { IsInt, IsOptional, Max, Min } from "class-validator";

export class TerminalConnectDto {
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(500)
  cols?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(200)
  rows?: number;
}
