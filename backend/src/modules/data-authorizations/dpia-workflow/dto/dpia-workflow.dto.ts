import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  PrivacyResidualRiskLevel,
  PrivacyRiskDataVolume,
  PrivacyRiskDuration,
  PrivacyRiskFrequency,
  PrivacyRiskLikelihood,
  PrivacyRiskSubjectScale,
} from '@prisma/client';

export class SubmitPrivacyRiskAssessmentDto {
  @IsOptional()
  @IsEnum(PrivacyRiskDataVolume)
  dataVolumeScope?: PrivacyRiskDataVolume;

  @IsOptional()
  @IsEnum(PrivacyRiskFrequency)
  processingFrequency?: PrivacyRiskFrequency;

  @IsOptional()
  @IsEnum(PrivacyRiskDuration)
  processingDuration?: PrivacyRiskDuration;

  @IsOptional()
  @IsEnum(PrivacyRiskSubjectScale)
  dataSubjectScale?: PrivacyRiskSubjectScale;

  @IsOptional()
  @IsBoolean()
  systematicMonitoring?: boolean;

  @IsOptional()
  @IsBoolean()
  locationData?: boolean;

  @IsOptional()
  @IsBoolean()
  profiling?: boolean;

  @IsOptional()
  @IsBoolean()
  automatedDecisionMaking?: boolean;

  @IsOptional()
  @IsBoolean()
  vulnerableSubjects?: boolean;

  @IsOptional()
  @IsBoolean()
  dataCombination?: boolean;

  @IsOptional()
  @IsBoolean()
  thirdCountryTransfer?: boolean;

  @IsOptional()
  @IsBoolean()
  externalRecipients?: boolean;

  @IsOptional()
  @IsString()
  securityMeasures?: string;

  @IsOptional()
  @IsString()
  potentialHarm?: string;

  @IsOptional()
  @IsEnum(PrivacyRiskLikelihood)
  likelihood?: PrivacyRiskLikelihood;

  @IsOptional()
  @IsEnum(PrivacyResidualRiskLevel)
  residualRiskLevel?: PrivacyResidualRiskLevel;
}

export class RiskItemDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  severity?: string;
}

export class CreateDpiaDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RiskItemDto)
  identifiedRisks?: RiskItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RiskItemDto)
  proposedMeasures?: RiskItemDto[];

  @IsOptional()
  @IsString()
  evidenceReference?: string;

  @IsOptional()
  @IsDateString()
  reviewDate?: string;

  @IsOptional()
  @IsString()
  privacyReviewerUserId?: string;

  @IsOptional()
  @IsString()
  securityReviewerUserId?: string;
}

export class UpdateDpiaDraftDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RiskItemDto)
  identifiedRisks?: RiskItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RiskItemDto)
  proposedMeasures?: RiskItemDto[];

  @IsOptional()
  @IsString()
  evidenceReference?: string;

  @IsOptional()
  @IsDateString()
  reviewDate?: string;
}

export class DpiaReviewDecisionDto {
  @IsString()
  @IsNotEmpty()
  outcome!: 'APPROVED' | 'REJECTED' | 'REQUESTED_CHANGES';

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RiskItemDto)
  approvedMeasures?: RiskItemDto[];

  @IsOptional()
  @IsEnum(PrivacyResidualRiskLevel)
  residualRisk?: PrivacyResidualRiskLevel;
}

export class AcceptResidualRiskDto {
  @IsEnum(PrivacyResidualRiskLevel)
  residualRisk!: PrivacyResidualRiskLevel;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class ApproveDpiaDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class RejectDpiaDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
