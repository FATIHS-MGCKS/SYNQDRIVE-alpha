import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { StationStatus, StationType } from '@prisma/client';
import {
  STATION_ORG_SUMMARIES_MAX_PAGE_SIZE,
} from '@shared/stations/station-org-summaries.contract';

function trimEmpty({ value }: { value: unknown }): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  return value;
}

function parseBoolean({ value }: { value: unknown }): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
}

export class ListStationSummariesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(STATION_ORG_SUMMARIES_MAX_PAGE_SIZE)
  pageSize?: number;

  @IsOptional()
  @IsEnum(StationStatus)
  status?: StationStatus;

  @IsOptional()
  @IsEnum(StationType)
  type?: StationType;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @Transform(trimEmpty)
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  pickupCapabilityAvailable?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  returnCapabilityAvailable?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  hasConfigurationProblems?: boolean;
}
