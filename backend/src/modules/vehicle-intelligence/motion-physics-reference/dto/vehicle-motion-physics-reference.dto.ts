import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { MotionPhysicsReferenceSource } from '@prisma/client';

export class CreateVehicleMotionPhysicsReferenceDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  curbMassKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  systemMotorPowerKw?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  systemPowerDefinition?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accel0To100S?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  variantAssumption?: string;

  @IsEnum(MotionPhysicsReferenceSource)
  source!: MotionPhysicsReferenceSource;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class VerifyVehicleMotionPhysicsReferenceDto {
  @IsUUID()
  documentExtractionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ConfirmVehicleMotionPhysicsReferenceDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
