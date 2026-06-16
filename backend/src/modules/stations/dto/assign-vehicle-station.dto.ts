import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class AssignVehicleStationDto {
  @IsUUID()
  vehicleId!: string;

  @IsOptional()
  @IsIn(['home', 'current', 'expected'])
  target?: 'home' | 'current' | 'expected';
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
}
