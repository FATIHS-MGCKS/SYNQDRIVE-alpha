import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class HandoverTechnicalObservationDraftDto {
  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  affectedArea?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  severity?: string;

  @IsOptional()
  @IsBoolean()
  blocksRental?: boolean;
}

/**
 * Validated handover payload for operator pickup/return endpoints.
 * Server derives performedBy* from the authenticated user.
 */
export class CreateHandoverProtocolDto {
  @IsOptional()
  @IsISO8601()
  performedAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pickupGateOverrideReason?: string | null;

  @IsOptional()
  @IsUUID('4')
  eligibilityApprovalId?: string | null;

  @IsNumber()
  @Min(0)
  @Max(9_999_999)
  odometerKm!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  fuelPercent!: number;

  @IsOptional()
  @IsBoolean()
  fuelFull?: boolean;

  @IsOptional()
  @IsBoolean()
  exteriorClean?: boolean;

  @IsOptional()
  @IsBoolean()
  interiorClean?: boolean;

  @IsOptional()
  @IsBoolean()
  tiresSeasonOk?: boolean;

  @IsOptional()
  @IsBoolean()
  warningLightsOn?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  warningLightsNotes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerSignatureName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  customerSignatureDataUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  staffSignatureName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  staffSignatureDataUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  documentsAcknowledged?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  damageIds?: string[];

  @IsOptional()
  @IsUUID('4')
  actualStationId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => HandoverTechnicalObservationDraftDto)
  technicalObservations?: HandoverTechnicalObservationDraftDto[];
}
