import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Min, ValidateIf } from 'class-validator';

export class ChangeVehicleHomeStationDto {
  @IsUUID()
  vehicleId!: string;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  newHomeStationId!: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
