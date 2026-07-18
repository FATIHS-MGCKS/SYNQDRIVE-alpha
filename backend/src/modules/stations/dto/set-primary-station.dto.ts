import { IsISO8601, IsOptional } from 'class-validator';

export class SetPrimaryStationDto {
  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}
