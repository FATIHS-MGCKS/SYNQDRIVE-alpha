import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { VehicleStatus } from '@prisma/client';

const trimEmptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export class FleetRentalHealthQueryDto {
  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  stationId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsEnum(VehicleStatus)
  vehicleStatus?: VehicleStatus;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  cursor?: string;
}
