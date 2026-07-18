import { PartialType } from '@nestjs/mapped-types';
import { IsISO8601, IsOptional } from 'class-validator';
import { CreateStationDto } from './create-station.dto';

export class UpdateStationDto extends PartialType(CreateStationDto) {
  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}
