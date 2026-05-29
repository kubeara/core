import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { ServerProvider } from "../enums/server-provider.enum";
import { ServerType } from "../enums/server-type.enum";

export const SERVER_LIST_SORT_FIELDS = [
  "name",
  "host",
  "status",
  "lastConnectedAt",
] as const;

export type ServerListSortField = (typeof SERVER_LIST_SORT_FIELDS)[number];

export class ListServersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  search?: string;

  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;

  @IsOptional()
  @IsEnum(ServerProvider)
  provider?: ServerProvider;

  @IsOptional()
  @IsEnum(ServerType)
  serverType?: ServerType;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === "true" || value === true) return true;
    if (value === "false" || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  connected?: boolean;

  @IsOptional()
  @IsIn(SERVER_LIST_SORT_FIELDS)
  sortBy: ServerListSortField = "lastConnectedAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder: "asc" | "desc" = "desc";
}
