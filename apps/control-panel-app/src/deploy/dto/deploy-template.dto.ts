import { IsString, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DeployTemplateDto {
    @IsString()
    templateSlug!: string;

    @IsOptional()
    @IsObject()
    @Type(() => Object)
    env?: Record<string, any>;

    @IsOptional()
    @IsObject()
    @Type(() => Object)
    ports?: Record<string, any>;
}
