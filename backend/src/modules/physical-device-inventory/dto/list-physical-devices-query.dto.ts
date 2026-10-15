import { PhysicalDeviceInventoryStatus, PhysicalDeviceModelCode } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ListPhysicalDevicesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  search?: string;

  @IsOptional()
  @IsEnum(PhysicalDeviceInventoryStatus)
  status?: PhysicalDeviceInventoryStatus;

  @IsOptional()
  @IsEnum(PhysicalDeviceModelCode)
  modelCode?: PhysicalDeviceModelCode;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  warehouseLocation?: string;

  @IsOptional()
  @IsUUID()
  ownerOrganizationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  offset?: number;
}
