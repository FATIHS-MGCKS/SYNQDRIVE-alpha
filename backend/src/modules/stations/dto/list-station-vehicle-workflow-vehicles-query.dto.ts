import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { STATION_VEHICLE_WORKFLOW_MAX_PAGE_SIZE } from '@shared/stations/station-vehicle-workflow.contract';

export class ListStationVehicleWorkflowVehiclesQueryDto {
  @IsOptional()
  @IsUUID()
  contextStationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(STATION_VEHICLE_WORKFLOW_MAX_PAGE_SIZE)
  pageSize?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  homeAtContextOnly?: boolean;
}
