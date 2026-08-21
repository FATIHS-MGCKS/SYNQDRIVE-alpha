import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SendSmsMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  recipient!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1600)
  content!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;
}
