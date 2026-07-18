import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  STATION_FLEET_MAX_PAGE_SIZE,
  StationFleetGroupKey,
} from '@shared/stations/station-fleet-read-model.contract';

export class ListStationFleetQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEnum(StationFleetGroupKey)
  group?: StationFleetGroupKey;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(STATION_FLEET_MAX_PAGE_SIZE)
  pageSize?: number;
}
