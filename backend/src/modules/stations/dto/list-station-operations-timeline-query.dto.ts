import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import {
  STATION_OPERATIONS_TIMELINE_DEFAULT_RANGE_DAYS,
  STATION_OPERATIONS_TIMELINE_MAX_PAGE_SIZE,
  StationOperationsTimelineSortOrder,
} from '@shared/stations/station-operations-timeline.contract';

export class ListStationOperationsTimelineQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(STATION_OPERATIONS_TIMELINE_MAX_PAGE_SIZE)
  pageSize?: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsEnum(StationOperationsTimelineSortOrder)
  sortOrder?: (typeof StationOperationsTimelineSortOrder)[keyof typeof StationOperationsTimelineSortOrder];

  @IsOptional()
  @IsISO8601()
  at?: string;
}

export const STATION_OPERATIONS_TIMELINE_QUERY_DEFAULTS = {
  rangeDays: STATION_OPERATIONS_TIMELINE_DEFAULT_RANGE_DAYS,
} as const;
