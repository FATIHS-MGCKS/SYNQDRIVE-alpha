import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export enum IdDocumentVerificationMethod {
  MANUAL = 'MANUAL',
  DIDIT = 'DIDIT',
  DEFERRED = 'DEFERRED',
}

export enum DrivingLicenseVerificationMethod {
  MANUAL = 'MANUAL',
  DIDIT = 'DIDIT',
  PICKUP = 'PICKUP',
  DEFERRED = 'DEFERRED',
}

export enum ProofOfAddressVerificationMethod {
  MANUAL = 'MANUAL',
  DIDIT = 'DIDIT',
  NOT_REQUIRED = 'NOT_REQUIRED',
  DEFERRED = 'DEFERRED',
}

export class VerificationPlanDomainDto {
  @IsEnum(IdDocumentVerificationMethod)
  method!: IdDocumentVerificationMethod | DrivingLicenseVerificationMethod | ProofOfAddressVerificationMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class IdDocumentVerificationPlanDto {
  @IsEnum(IdDocumentVerificationMethod)
  method!: IdDocumentVerificationMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class DrivingLicenseVerificationPlanDto {
  @IsEnum(DrivingLicenseVerificationMethod)
  method!: DrivingLicenseVerificationMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ProofOfAddressVerificationPlanDto {
  @IsEnum(ProofOfAddressVerificationMethod)
  method!: ProofOfAddressVerificationMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CustomerVerificationPlanDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => IdDocumentVerificationPlanDto)
  idDocument?: IdDocumentVerificationPlanDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DrivingLicenseVerificationPlanDto)
  drivingLicense?: DrivingLicenseVerificationPlanDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProofOfAddressVerificationPlanDto)
  proofOfAddress?: ProofOfAddressVerificationPlanDto;

  @IsOptional()
  @IsBoolean()
  autoStartDidit?: boolean;
}
