import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  LegalBasisConsentRequirement,
  PrivacyLegalBasisType,
} from '@prisma/client';
import {
  LEGAL_BASIS_CONSENT_APPLICABLE_REQUIREMENTS,
  PRIVACY_LEGAL_BASIS_TYPES,
} from '../legal-basis-assessment.constants';

export class CreateLegalBasisAssessmentDto {
  @IsEnum(PrivacyLegalBasisType)
  legalBasisType!: PrivacyLegalBasisType;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  legalReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  necessityAssessment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  proportionalityAssessment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  legitimateInterestDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  balancingTestReference?: string;

  @IsOptional()
  @IsEnum(LegalBasisConsentRequirement)
  consentRequirement?: LegalBasisConsentRequirement;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsDateString()
  reviewDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  evidenceReferences?: string[];
}

export class UpdateLegalBasisAssessmentDto {
  @IsOptional()
  @IsEnum(PrivacyLegalBasisType)
  legalBasisType?: PrivacyLegalBasisType;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  legalReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  necessityAssessment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  proportionalityAssessment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  legitimateInterestDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  balancingTestReference?: string;

  @IsOptional()
  @IsEnum(LegalBasisConsentRequirement)
  consentRequirement?: LegalBasisConsentRequirement;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsDateString()
  reviewDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  evidenceReferences?: string[];
}

export class RejectLegalBasisAssessmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  rejectionReason!: string;
}

export class ListLegalBasisAssessmentsQueryDto {
  @IsOptional()
  @IsEnum(PrivacyLegalBasisType)
  legalBasisType?: PrivacyLegalBasisType;

  @IsOptional()
  @IsUUID('4')
  policyFamilyId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export { PRIVACY_LEGAL_BASIS_TYPES, LEGAL_BASIS_CONSENT_APPLICABLE_REQUIREMENTS };
