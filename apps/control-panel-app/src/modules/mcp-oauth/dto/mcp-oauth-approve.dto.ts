import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class McpOAuthApproveDto {
  @IsString()
  @IsNotEmpty()
  response_type!: string;

  @IsString()
  @IsNotEmpty()
  client_id!: string;

  @IsString()
  @IsNotEmpty()
  redirect_uri!: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsString()
  @IsNotEmpty()
  state!: string;

  @IsString()
  @IsNotEmpty()
  code_challenge!: string;

  @IsString()
  @IsNotEmpty()
  code_challenge_method!: string;

  @IsOptional()
  @IsString()
  resource?: string;
}
