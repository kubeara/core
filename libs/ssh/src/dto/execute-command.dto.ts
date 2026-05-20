import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ExecuteCommandDto {
    @IsString()
    command!: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    timeout?: number;
}
