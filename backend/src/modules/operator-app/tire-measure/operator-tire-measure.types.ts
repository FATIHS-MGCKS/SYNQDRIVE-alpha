import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TIRE_MEASUREMENT_SOURCES } from '@modules/vehicle-intelligence/tires/dto/tire-mutation.dto';

export const OPERATOR_TIRE_MEASURE_SOURCES = ['manual', 'workshop', 'ai_confirmed'] as const;
export type OperatorTireMeasureSource = (typeof OPERATOR_TIRE_MEASURE_SOURCES)[number];

export class OperatorTireMeasurementCaptureDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  captureKey!: string;

  @IsBoolean()
  confirmed!: boolean;

  @IsOptional()
  @IsUUID()
  tireSetupId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  frontLeftMm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  frontRightMm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  rearLeftMm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  rearRightMm?: number;

  @IsOptional()
  @IsString()
  measuredAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  odometerKm?: number;

  @IsOptional()
  @IsBoolean()
  confirmOdometer?: boolean;

  @IsOptional()
  @IsIn(OPERATOR_TIRE_MEASURE_SOURCES as unknown as string[])
  source?: OperatorTireMeasureSource;

  @IsOptional()
  @IsIn(TIRE_MEASUREMENT_SOURCES as unknown as string[])
  measurementSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  workshopName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @IsOptional()
  @IsUUID()
  handoverSessionId?: string;

  @IsOptional()
  @IsUUID()
  stationId?: string;
}

export interface OperatorTireMeasurementCaptureResultDto {
  measurementId: string;
  tireSetupId: string;
  idempotentReplay: boolean;
  warnings: string[];
  treadMm: {
    frontLeft: number | null;
    frontRight: number | null;
    rearLeft: number | null;
    rearRight: number | null;
  };
}
