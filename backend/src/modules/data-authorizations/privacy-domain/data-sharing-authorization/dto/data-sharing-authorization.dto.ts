import {
  ArrayNotEmpty,
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
  DataSharingRecipientRole,
  DataTransferMechanism,
  PrivacyProcessingDataCategory,
  PrivacyProcessingPurpose,
} from '@prisma/client';

export class CreateDataSharingAuthorizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  recipient!: string;

  @IsEnum(DataSharingRecipientRole)
  recipientRole!: DataSharingRecipientRole;

  @IsEnum(PrivacyProcessingPurpose)
  purpose!: PrivacyProcessingPurpose;

  @IsUUID('4')
  legalBasisAssessmentId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(PrivacyProcessingDataCategory, { each: true })
  dataCategories!: PrivacyProcessingDataCategory[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  transferCountry?: string;

  @IsOptional()
  @IsEnum(DataTransferMechanism)
  transferMechanism?: DataTransferMechanism;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;
}

export class AuthorizeDataSharingDto {
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;
}

export class RevokeDataSharingAuthorizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}
