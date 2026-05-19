import { IsString, IsOptional, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class DeployTemplateDto {
    @IsString()
    templateSlug!: string;

    /** When provided, reuse this deployment and merge stored env with the request body. */
    @IsOptional()
    @IsString()
    deploymentId?: string;

    @IsOptional()
    @IsObject()
    @Type(() => Object)
    env?: Record<string, unknown>;

    @IsOptional()
    @IsObject()
    @Type(() => Object)
    ports?: Record<string, unknown>;
}
