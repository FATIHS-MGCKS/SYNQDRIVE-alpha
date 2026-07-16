import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import {
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
} from '../battery-v2-domain';

export class CreateVehicleBatteryReferenceCapacityDto {
  @IsNumber()
  @Min(0.1)
  capacityKwh!: number;

  @IsEnum(BatteryReferenceCapacityType)
  capacityType!: BatteryReferenceCapacityType;

  @IsEnum(BatteryReferenceCapacitySource)
  source!: BatteryReferenceCapacitySource;

  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsOptional()
  @IsUUID()
  serviceEventId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class VerifyVehicleBatteryReferenceCapacityDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateVehicleBatteryReferenceCapacityNotesDto {
  @IsString()
  @MaxLength(2000)
  notes!: string;
}
