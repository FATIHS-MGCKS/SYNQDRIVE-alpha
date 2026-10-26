import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { KNOWN_HV_CATALOG_VARIANT_KEYS } from '../vehicle-hv-master-specification.domain';

export class UpsertVehicleHvMasterSpecificationDto {
  @IsOptional()
  @IsIn(['ESTIMATED', 'CONFIRMED'])
  provenance?: 'ESTIMATED' | 'CONFIRMED';

  @IsOptional()
  @IsString()
  @MaxLength(256)
  variantLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  evidenceNote?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  grossCapacityKwh?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  nominalVoltageV?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  chemistry?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  cellFormat?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  architecture?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  thermalManagement?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  acOnboardChargerKw?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dcFastChargeMaxKw?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  warrantyYears?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  warrantyKm?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  catalogReferences?: string[] | null;

  @IsOptional()
  @ValidateIf((_o, value) => value != null && value !== '')
  @IsString()
  @MaxLength(64)
  @IsIn(KNOWN_HV_CATALOG_VARIANT_KEYS as unknown as string[])
  catalogVariantKey?: string | null;
}
