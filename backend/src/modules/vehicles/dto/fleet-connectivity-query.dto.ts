import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { FleetConnectionStatus } from '../fleet-connectivity.types';

const STATUS_FILTERS = [
  'online',
  'standby',
  'offline',
  'not_connected',
] as const satisfies readonly FleetConnectionStatus[];

export class FleetConnectivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @IsIn(STATUS_FILTERS)
  status?: FleetConnectionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
