import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Validation DTOs for the brake-health mutation endpoints. These replace the
 * previous inline `body: {...}` literal types so the global ValidationPipe
 * (whitelist + forbidNonWhitelisted + transform) enforces realistic ranges and
 * valid enums before anything reaches BrakeLifecycleService / BrakesService.
 *
 * No fake mm is invented anywhere: every measurement field is optional and is
 * only persisted as evidence when an actual value is provided by the user.
 */

// Pad thickness new ≈ 10–12 mm, performance discs ≈ 30 mm — allow generous caps.
const PAD_MM_MAX = 25;
const DISC_MM_MAX = 50;
const ODO_MAX = 5_000_000;

export const BRAKE_SERVICE_KINDS = [
  'inspection_only',
  'pads_service',
  'discs_service',
  'brake_fluid_service',
  'full_brake_service',
] as const;

export const BRAKE_SERVICE_SCOPES = [
  'front_pads',
  'rear_pads',
  'front_discs',
  'rear_discs',
] as const;

export const BRAKE_SERVICE_SOURCES = ['manual', 'ai_document', 'api'] as const;

// ── Measured snapshot (nested) ──────────────────────────────────────────────

export class BrakeMeasuredDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(PAD_MM_MAX)
  frontPadMm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(PAD_MM_MAX)
  rearPadMm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(DISC_MM_MAX)
  frontDiscMm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(DISC_MM_MAX)
  rearDiscMm?: number;
}

// ── Initialize (flat body used by the Health card) ──────────────────────────

export class InitializeBrakeHealthDto {
  @IsISO8601()
  serviceDate!: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(ODO_MAX)
  odometerKm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(PAD_MM_MAX)
  frontPadMm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(PAD_MM_MAX)
  rearPadMm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(DISC_MM_MAX)
  frontRotorWidthMm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(DISC_MM_MAX)
  rearRotorWidthMm?: number;

  @IsOptional() @IsIn(BRAKE_SERVICE_KINDS as unknown as string[])
  kind?: (typeof BRAKE_SERVICE_KINDS)[number];

  @IsOptional()
  @IsArray()
  @IsIn(BRAKE_SERVICE_SCOPES as unknown as string[], { each: true })
  scope?: Array<(typeof BRAKE_SERVICE_SCOPES)[number]>;

  @IsOptional() @IsString() @MaxLength(160)
  workshopName?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;

  @IsOptional() @IsIn(BRAKE_SERVICE_SOURCES as unknown as string[])
  source?: (typeof BRAKE_SERVICE_SOURCES)[number];
}

// ── Record a brake lifecycle service (nested measured) ──────────────────────

export class RecordBrakeServiceDto {
  @IsISO8601()
  serviceDate!: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(ODO_MAX)
  odometerKm?: number;

  @IsOptional() @IsString() @MaxLength(160)
  workshopName?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;

  @IsOptional() @IsIn(BRAKE_SERVICE_SOURCES as unknown as string[])
  source?: (typeof BRAKE_SERVICE_SOURCES)[number];

  @IsOptional() @IsIn(BRAKE_SERVICE_KINDS as unknown as string[])
  kind?: (typeof BRAKE_SERVICE_KINDS)[number];

  @IsOptional()
  @IsArray()
  @IsIn(BRAKE_SERVICE_SCOPES as unknown as string[], { each: true })
  scope?: Array<(typeof BRAKE_SERVICE_SCOPES)[number]>;

  @IsOptional()
  @ValidateNested()
  @Type(() => BrakeMeasuredDto)
  measured?: BrakeMeasuredDto;

  @IsOptional() @IsBoolean()
  initializeIfPossible?: boolean;

  @IsOptional() @IsString() @MaxLength(2000)
  documentUrl?: string;
}

// ── Brake reference spec (master-admin registration) ────────────────────────

export class CreateBrakeSpecDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1000)
  frontRotorDiameter?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(DISC_MM_MAX)
  frontRotorWidth?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(PAD_MM_MAX)
  frontPadThickness?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1000)
  rearRotorDiameter?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(DISC_MM_MAX)
  rearRotorWidth?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(PAD_MM_MAX)
  rearPadThickness?: number;

  @IsOptional() @IsString() @MaxLength(80)
  sourceType?: string;
}

export class UpdateBrakeSpecDto extends CreateBrakeSpecDto {}

// ── Vehicle registration manual brake baseline ──────────────────────────────

export const REGISTRATION_BRAKE_CONDITIONS = ['NEW', 'USED', 'UNKNOWN'] as const;

export class RegistrationBrakeManualSpecDto extends CreateBrakeSpecDto {
  @IsOptional() @IsIn(REGISTRATION_BRAKE_CONDITIONS as unknown as string[])
  condition?: (typeof REGISTRATION_BRAKE_CONDITIONS)[number];

  @IsOptional() @IsISO8601()
  serviceDate?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(ODO_MAX)
  odometerKm?: number;
}
