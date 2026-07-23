import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  HANDOVER_DAMAGE_IDS_MAX,
  HANDOVER_NOTES_MAX_LENGTH,
  HANDOVER_ODOMETER_MAX_KM,
  HANDOVER_OVERRIDE_REASON_MAX_LENGTH,
  HANDOVER_OVERRIDE_REASON_MIN_LENGTH,
  HANDOVER_SIGNATURE_NAME_MAX_LENGTH,
  HANDOVER_TECHNICAL_OBSERVATIONS_MAX,
  HANDOVER_WARNING_LIGHTS_NOTES_MAX_LENGTH,
} from '../../handover-error.codes';
import { IsHandoverSignatureDataUrl } from './handover-signature.validator';
import { HandoverTechnicalObservationDto } from './handover-technical-observation.dto';

/**
 * Validated HTTP body for pickup/return handover protocol submission.
 * Flat scalar fields only — no Prisma relation shapes, no client actor fields.
 */
export class CreateHandoverProtocolDto {
  /** Pickup only — ISO-8601 backdate within server-enforced window. */
  @IsOptional()
  @IsISO8601({ strict: true })
  performedAt?: string;

  /** Mandatory when overriding soft pickup gate blocks (requires `booking.override`). */
  @IsOptional()
  @IsString()
  @MinLength(HANDOVER_OVERRIDE_REASON_MIN_LENGTH)
  @MaxLength(HANDOVER_OVERRIDE_REASON_MAX_LENGTH)
  pickupGateOverrideReason?: string;

  /** Mandatory when return odometer is below pickup odometer (requires `booking.override`). */
  @IsOptional()
  @IsString()
  @MinLength(HANDOVER_OVERRIDE_REASON_MIN_LENGTH)
  @MaxLength(HANDOVER_OVERRIDE_REASON_MAX_LENGTH)
  odometerOverrideReason?: string;

  @IsInt()
  @Min(0)
  @Max(HANDOVER_ODOMETER_MAX_KM)
  odometerKm!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  fuelPercent?: number;

  /** EV charge state alias — mapped to `fuelPercent` when fuelPercent omitted. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  chargePercent?: number;

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

  @ValidateIf((o: CreateHandoverProtocolDto) => o.warningLightsOn === true)
  @IsString()
  @MinLength(1)
  @MaxLength(HANDOVER_WARNING_LIGHTS_NOTES_MAX_LENGTH)
  warningLightsNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(HANDOVER_NOTES_MAX_LENGTH)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(HANDOVER_SIGNATURE_NAME_MAX_LENGTH)
  customerSignatureName?: string;

  @IsOptional()
  @IsHandoverSignatureDataUrl()
  customerSignatureDataUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(HANDOVER_SIGNATURE_NAME_MAX_LENGTH)
  staffSignatureName?: string;

  @IsOptional()
  @IsHandoverSignatureDataUrl()
  staffSignatureDataUrl?: string;

  @IsOptional()
  @IsBoolean()
  documentsAcknowledged?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(HANDOVER_DAMAGE_IDS_MAX)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  damageIds?: string[];

  @IsOptional()
  @IsUUID('4')
  actualStationId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(HANDOVER_TECHNICAL_OBSERVATIONS_MAX)
  @ValidateNested({ each: true })
  @Type(() => HandoverTechnicalObservationDto)
  technicalObservations?: HandoverTechnicalObservationDto[];

  @IsOptional()
  @IsBoolean()
  keysHandedOver?: boolean;

  @IsOptional()
  @IsBoolean()
  idDocumentVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  licenseVerified?: boolean;
}
