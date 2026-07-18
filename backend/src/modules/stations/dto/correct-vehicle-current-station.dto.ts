import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, IsUUID, Min, MinLength, ValidateIf } from 'class-validator';

export class CorrectVehicleCurrentStationDto {
  @IsUUID()
  vehicleId!: string;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  currentStationId!: string | null;

  @IsIn(['MANUAL'])
  source!: 'MANUAL';

  @IsString()
  @MinLength(1)
  reason!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}
