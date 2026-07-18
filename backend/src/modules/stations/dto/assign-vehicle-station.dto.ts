import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Min, ValidateNested } from 'class-validator';

export class AssignVehicleStationDto {
  @IsUUID()
  vehicleId!: string;

  @IsOptional()
  @IsIn(['home', 'current', 'expected'])
  target?: 'home' | 'current' | 'expected';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

export class UpdateVehicleCurrentStationDto {
  @IsUUID()
  vehicleId!: string;

  @IsOptional()
  @IsUUID()
  currentStationId?: string | null;

  @IsOptional()
  @IsUUID()
  expectedStationId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

export class VehiclePositionVersionDto {
  @IsUUID()
  vehicleId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}
