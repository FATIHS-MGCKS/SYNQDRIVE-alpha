import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  NotificationDomain,
  NotificationEntityType,
  NotificationSeverity,
  NotificationStatus,
} from '@prisma/client';

function trimEmpty({ value }: { value: unknown }): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? undefined : t;
  }
  return value;
}

function parseBoolean({ value }: { value: unknown }): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
}

function parseEnumArray<T extends string>(enumObj: Record<string, T>) {
  const allowed = new Set(Object.values(enumObj));
  return ({ value }: { value: unknown }): T[] | undefined => {
    if (value === undefined || value === null || value === '') return undefined;
    const raw = Array.isArray(value) ? value : String(value).split(',');
    const parsed = raw.map((v) => String(v).trim().toUpperCase()).filter((v) => allowed.has(v as T));
    return parsed.length ? (parsed as T[]) : undefined;
  };
}

/**
 * Query parameters for GET /organizations/:orgId/notifications
 */
export class ListNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(parseEnumArray(NotificationStatus))
  status?: NotificationStatus[];

  @IsOptional()
  @Transform(parseEnumArray(NotificationSeverity))
  severity?: NotificationSeverity[];

  @IsOptional()
  @IsEnum(NotificationDomain)
  domain?: NotificationDomain;

  @IsOptional()
  @IsEnum(NotificationEntityType)
  entityType?: NotificationEntityType;

  @IsOptional()
  @Transform(trimEmpty)
  @IsString()
  entityId?: string;

  @IsOptional()
  @Transform(trimEmpty)
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @Transform(trimEmpty)
  @IsString()
  stationId?: string;

  @IsOptional()
  @Transform(trimEmpty)
  @IsString()
  bookingId?: string;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  unreadOnly?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  activeOnly?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  resolvedOnly?: boolean;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(['lastSeenAt', 'createdAt', 'severity'])
  sortBy?: 'lastSeenAt' | 'createdAt' | 'severity';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @Transform(trimEmpty)
  @IsString()
  @MaxLength(120)
  search?: string;
}

/**
 * Body for POST .../snooze — snooze until must be in the future.
 */
export class SnoozeNotificationDto {
  @IsISO8601()
  until!: string;
}
