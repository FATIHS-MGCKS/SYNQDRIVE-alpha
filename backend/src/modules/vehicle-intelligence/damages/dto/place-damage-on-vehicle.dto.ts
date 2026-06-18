import { DamageLocationView } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const LABEL_MAX = 200;
const COORD_MAX = 100;

export class PlaceDamageOnVehicleDto {
  @IsEnum(DamageLocationView)
  locationView!: DamageLocationView;

  @Type(() => Number)
  @Min(0)
  @Max(COORD_MAX)
  locationX!: number;

  @Type(() => Number)
  @Min(0)
  @Max(COORD_MAX)
  locationY!: number;

  @IsOptional()
  @IsString()
  @MaxLength(LABEL_MAX)
  locationLabel?: string;
}
