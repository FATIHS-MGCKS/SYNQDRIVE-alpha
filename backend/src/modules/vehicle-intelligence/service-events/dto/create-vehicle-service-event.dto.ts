import { ServiceEventOrigin, ServiceEventType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const SERVICE_EVENT_TYPES = Object.values(ServiceEventType);
const SERVICE_EVENT_ORIGINS = Object.values(ServiceEventOrigin);

const NOTES_MAX = 4000;
const WORKSHOP_MAX = 200;
const PROVIDER_MAX = 120;
const ODO_MAX = 5_000_000;
const COST_MAX = 100_000_000;

export class CreateVehicleServiceEventDto {
  @IsEnum(ServiceEventType, {
    message: `eventType must be one of: ${SERVICE_EVENT_TYPES.join(', ')}`,
  })
  eventType!: ServiceEventType;

  @IsISO8601()
  eventDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(ODO_MAX)
  odometerKm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(NOTES_MAX)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(WORKSHOP_MAX)
  workshopName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(COST_MAX)
  costCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(PROVIDER_MAX)
  provider?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(2000)
  documentUrl?: string;

  @IsOptional()
  @IsEnum(ServiceEventOrigin, {
    message: `origin must be one of: ${SERVICE_EVENT_ORIGINS.join(', ')}`,
  })
  origin?: ServiceEventOrigin;
}
