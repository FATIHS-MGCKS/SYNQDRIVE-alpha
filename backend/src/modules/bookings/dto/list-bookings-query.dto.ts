import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { BookingStatus } from '@prisma/client';
import {
  BOOKING_LIST_DEFAULT_LIMIT,
  BOOKING_LIST_MAX_LIMIT,
  type BookingListSortField,
  type BookingListSortOrder,
  parseBookingStatusFilter,
  parseVehicleIdsFilter,
} from '../bookings-list-pagination.util';

const toOptionalInt = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : undefined;
};

const toOptionalBool = (value: unknown): boolean | undefined => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
};

export class ListBookingsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toOptionalInt(value))
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalInt(value))
  @Min(1)
  @Max(BOOKING_LIST_MAX_LIMIT)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsIn(['startDate', 'endDate', 'createdAt'])
  sortBy?: BookingListSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: BookingListSortOrder;

  @IsOptional()
  @Transform(({ value }) => parseBookingStatusFilter(value))
  status?: BookingStatus[];

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @Transform(({ value }) => parseVehicleIdsFilter(value))
  vehicleIds?: string[];

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  stationId?: string;

  @IsOptional()
  @IsDateString()
  /** Inclusive UTC lower bound for list overlap filter — window is half-open `[from, to)`. */
  from?: string;

  @IsOptional()
  @IsDateString()
  /** Exclusive UTC upper bound for list overlap filter — window is half-open `[from, to)`. */
  to?: string;

  @IsOptional()
  @IsString()
  search?: string;

  /** Alias for search — matches booking id suffix / BK- reference. */
  @IsOptional()
  @IsString()
  bookingNumber?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBool(value))
  excludeTerminal?: boolean;

  resolvedLimit(): number {
    const requested = this.limit ?? BOOKING_LIST_DEFAULT_LIMIT;
    return Math.min(Math.max(1, requested), BOOKING_LIST_MAX_LIMIT);
  }

  resolvedPage(): number {
    return Math.max(1, this.page ?? 1);
  }

  resolvedSortBy(): BookingListSortField {
    return this.sortBy ?? 'startDate';
  }

  resolvedSortOrder(): BookingListSortOrder {
    return this.sortOrder ?? 'desc';
  }
}
