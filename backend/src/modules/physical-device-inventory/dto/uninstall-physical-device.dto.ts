import {
  Equals,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export enum PhysicalDeviceUninstallCondition {
  FUNCTIONAL = 'FUNCTIONAL',
  DEFECTIVE = 'DEFECTIVE',
}

export class UninstallPhysicalDeviceDto {
  @IsUUID()
  vehicleId!: string;

  @IsUUID()
  assignmentId!: string;

  @IsBoolean()
  @Equals(true, { message: 'physicalUninstallConfirmed must be true' })
  physicalUninstallConfirmed!: boolean;

  @IsString()
  @MaxLength(2000)
  uninstallReason!: string;

  @IsEnum(PhysicalDeviceUninstallCondition)
  deviceConditionAfterUninstall!: PhysicalDeviceUninstallCondition;

  @IsBoolean()
  physicalReturnConfirmed!: boolean;

  @ValidateIf((o) => o.physicalReturnConfirmed === true)
  @IsString()
  @MaxLength(256)
  warehouseLocation?: string;

  @ValidateIf((o) => o.deviceConditionAfterUninstall === PhysicalDeviceUninstallCondition.DEFECTIVE)
  @IsString()
  @MaxLength(2000)
  defectDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
