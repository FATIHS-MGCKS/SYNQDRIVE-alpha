import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { StationRuleManualOverrideDto } from './evaluate-station-booking-rules.dto';
import { StationVehicleWorkflowType } from '@shared/stations/station-vehicle-workflow.contract';

export class StationVehicleWorkflowPreviewDto {
  @IsIn(Object.values(StationVehicleWorkflowType))
  workflow!: (typeof StationVehicleWorkflowType)[keyof typeof StationVehicleWorkflowType];

  @IsUUID()
  vehicleId!: string;

  @IsUUID()
  contextStationId!: string;

  @ValidateIf((dto) =>
  dto.workflow === StationVehicleWorkflowType.CHANGE_HOME ||
    dto.workflow === StationVehicleWorkflowType.CORRECT_CURRENT ||
    dto.workflow === StationVehicleWorkflowType.PLAN_TRANSFER,
  )
  @IsUUID()
  targetStationId?: string;

  @IsOptional()
  @IsDateString()
  plannedAt?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  expectedArrivalAt?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => StationRuleManualOverrideDto)
  manualOverride?: StationRuleManualOverrideDto | null;
}
