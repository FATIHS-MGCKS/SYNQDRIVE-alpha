import { IsBoolean, IsOptional } from 'class-validator';

export class RestoreStationDto {
  @IsBoolean()
  pickupEnabled: boolean;

  @IsBoolean()
  returnEnabled: boolean;

  @IsOptional()
  @IsBoolean()
  afterHoursReturnEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  keyBoxAvailable?: boolean;
}
