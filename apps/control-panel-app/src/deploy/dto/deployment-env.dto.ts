import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class DeploymentEnvDto {
    @IsString()
    @IsNotEmpty()
    key!: string;

    @IsOptional()
    @IsString()
    value?: string;
}
