import { IsEnum, IsOptional } from 'class-validator';
import { StationStatus, StationType } from '@prisma/client';

export class ListStationsQueryDto {
  @IsOptional()
  @IsEnum(StationStatus)
  status?: StationStatus;

  @IsOptional()
  @IsEnum(StationType)
  type?: StationType;

  @IsOptional()
  selectableOnly?: string;
}
