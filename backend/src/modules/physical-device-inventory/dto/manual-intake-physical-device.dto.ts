import { PhysicalDeviceModelCode } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ManualIntakePhysicalDeviceDto {
  @IsEnum(PhysicalDeviceModelCode)
  modelCode!: PhysicalDeviceModelCode;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  imei?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  warehouseLocation!: string;

  @IsOptional()
  @IsUUID()
  ownerOrganizationId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  intakeNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
