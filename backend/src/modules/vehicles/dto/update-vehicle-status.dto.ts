import { CleaningStatus, HealthStatus, VehicleStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

/** Dedicated operational status PATCH — not accepted on generic vehicle PATCH. */
export class UpdateVehicleStatusDto {
  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @IsOptional()
  @IsEnum(CleaningStatus)
  cleaningStatus?: CleaningStatus;

  @IsOptional()
  @IsEnum(HealthStatus)
  healthStatus?: HealthStatus;
}
