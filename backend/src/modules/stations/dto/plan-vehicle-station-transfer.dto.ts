import { Type } from 'class-transformer';
import { IsDateString, IsOptional, IsString, IsUUID, ValidateIf, ValidateNested } from 'class-validator';
import { StationRuleManualOverrideDto } from './evaluate-station-booking-rules.dto';

export class PlanVehicleStationTransferDto {
  @IsUUID()
  vehicleId!: string;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  fromStationId?: string | null;

  @IsUUID()
  toStationId!: string;

  @IsOptional()
  @IsDateString()
  plannedAt?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  expectedArrivalAt?: string | null;

  @IsOptional()
  @IsString()
  reason?: string | null;

  @IsOptional()
  @IsUUID()
  sourceBookingId?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => StationRuleManualOverrideDto)
  manualOverride?: StationRuleManualOverrideDto | null;
}
