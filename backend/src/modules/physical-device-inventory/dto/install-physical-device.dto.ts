import { Equals, IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class InstallPhysicalDeviceDto {
  @IsUUID()
  vehicleId!: string;

  @IsBoolean()
  @Equals(true, { message: 'installConfirmation must be true' })
  installConfirmation!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  installNotes?: string;
}
