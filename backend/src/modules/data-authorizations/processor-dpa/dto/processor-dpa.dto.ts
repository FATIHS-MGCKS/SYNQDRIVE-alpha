import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  DataProcessingAgreementStatus,
  DataTransferMechanism,
  DpaSubprocessorStatus,
  ProcessorPartyRole,
  TransferAssessmentStatus,
} from '@prisma/client';

export class DpaDataLocationDto {
  @IsString()
  @IsNotEmpty()
  countryCode!: string;

  @IsOptional()
  @IsString()
  regionLabel?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class DpaTransferCountryDto {
  @IsString()
  @IsNotEmpty()
  countryCode!: string;

  @IsEnum(DataTransferMechanism)
  transferMechanism!: DataTransferMechanism;

  @IsOptional()
  @IsEnum(TransferAssessmentStatus)
  assessmentStatus?: TransferAssessmentStatus;

  @IsOptional()
  @IsString()
  safeguards?: string;
}

export class DpaSubprocessorDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsEnum(ProcessorPartyRole)
  processorRole?: ProcessorPartyRole;

  @IsOptional()
  @IsString()
  dataLocationCountry?: string;

  @IsOptional()
  @IsString()
  processingPartnerCountry?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;
}

export class CreateDataProcessingAgreementDto {
  @IsString()
  @IsNotEmpty()
  processorName!: string;

  @IsEnum(ProcessorPartyRole)
  processorRole!: ProcessorPartyRole;

  @IsOptional()
  @IsString()
  contractReference?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  processingActivityIds?: string[];

  @IsOptional()
  @IsString()
  processingActivityId?: string;

  @IsOptional()
  @IsString()
  safeguards?: string;

  @IsOptional()
  @IsEnum(DataTransferMechanism)
  primaryTransferMechanism?: DataTransferMechanism;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsOptional()
  @IsDateString()
  reviewDate?: string;

  @IsOptional()
  @IsString()
  ownerUserId?: string;

  @IsOptional()
  @IsString()
  providerKind?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DpaDataLocationDto)
  dataLocations?: DpaDataLocationDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DpaTransferCountryDto)
  transferCountries?: DpaTransferCountryDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DpaSubprocessorDto)
  subprocessors?: DpaSubprocessorDto[];
}

export class UpdateDataProcessingAgreementDto {
  @IsOptional()
  @IsString()
  processorName?: string;

  @IsOptional()
  @IsEnum(ProcessorPartyRole)
  processorRole?: ProcessorPartyRole;

  @IsOptional()
  @IsString()
  contractReference?: string;

  @IsOptional()
  @IsString()
  safeguards?: string;

  @IsOptional()
  @IsEnum(DataTransferMechanism)
  primaryTransferMechanism?: DataTransferMechanism;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsOptional()
  @IsDateString()
  reviewDate?: string;

  @IsOptional()
  @IsString()
  ownerUserId?: string;

  @IsOptional()
  @IsString()
  providerKind?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  processingActivityIds?: string[];
}

export class ActivateDataProcessingAgreementDto {
  @IsOptional()
  @IsDateString()
  signedAt?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class TerminateDataProcessingAgreementDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class LinkDpaSharingAuthorizationDto {
  @IsString()
  @IsNotEmpty()
  dataSharingAuthorizationId!: string;
}

export class UpdateDpaSubprocessorDto extends DpaSubprocessorDto {
  @IsOptional()
  @IsEnum(DpaSubprocessorStatus)
  status?: DpaSubprocessorStatus;
}

export class ReviewDpaSubprocessorDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateDpaVersionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export const DPA_PUBLIC_SELECT = {
  id: true,
  organizationId: true,
  policyFamilyId: true,
  versionNumber: true,
  isCurrentVersion: true,
  processingActivityId: true,
  processorName: true,
  processorRole: true,
  contractReference: true,
  status: true,
  effectiveFrom: true,
  effectiveUntil: true,
  reviewDate: true,
  ownerUserId: true,
  safeguards: true,
  primaryTransferMechanism: true,
  transferAssessmentStatus: true,
  providerKind: true,
  signedByUserId: true,
  signedAt: true,
  terminatedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;
