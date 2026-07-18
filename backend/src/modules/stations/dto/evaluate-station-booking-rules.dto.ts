import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { StationBookingRulesBookingType } from '@shared/stations/station-booking-rules.contract';

export class StationBookingRulesAdminOverrideDto {
  @IsOptional()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  performedByUserId?: string | null;
}

export class StationBookingRulesBookingContextDto {
  @IsOptional()
  @IsString()
  channel?: 'CUSTOMER' | 'INTERNAL_ADMIN';

  @IsOptional()
  @ValidateNested()
  @Type(() => StationBookingRulesAdminOverrideDto)
  adminOverride?: StationBookingRulesAdminOverrideDto | null;
}

export class EvaluateStationBookingRulesDto {
  @IsUUID()
  pickupStationId!: string;

  @IsUUID()
  returnStationId!: string;

  @IsISO8601()
  pickupDateTime!: string;

  @IsISO8601()
  returnDateTime!: string;

  @IsEnum(StationBookingRulesBookingType)
  bookingType!: StationBookingRulesBookingType;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => StationBookingRulesBookingContextDto)
  bookingContext?: StationBookingRulesBookingContextDto | null;
}
