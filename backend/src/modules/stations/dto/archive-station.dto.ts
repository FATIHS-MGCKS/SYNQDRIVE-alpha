import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ArchiveStationDto {
  @IsOptional()
  @IsUUID()
  successorPrimaryStationId?: string;

  @IsOptional()
  @IsBoolean()
  acknowledgeFutureBookings?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
