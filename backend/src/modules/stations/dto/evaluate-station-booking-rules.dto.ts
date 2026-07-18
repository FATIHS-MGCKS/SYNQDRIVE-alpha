import { IsDateString, IsEnum, IsISO8601, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { StationBookingRulesBookingType } from '@shared/stations/station-booking-rules.contract';

export class StationRuleManualOverrideDto {
  @IsString()
  reason!: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;
}

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
  @IsUUID()
  bookingId?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => StationRuleManualOverrideDto)
  manualOverride?: StationRuleManualOverrideDto | null;

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
