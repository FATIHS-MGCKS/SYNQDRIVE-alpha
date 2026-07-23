import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ArrayNotEmpty,
} from 'class-validator';
import {
  ConsentInteractionChannel,
  DataSubjectType,
  PrivacyProcessingPurpose,
} from '@prisma/client';

export class CreateDataSubjectConsentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  dataSubjectReference!: string;

  @IsEnum(DataSubjectType)
  subjectType!: DataSubjectType;

  @IsEnum(PrivacyProcessingPurpose)
  purpose!: PrivacyProcessingPurpose;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  consentTextVersion!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  privacyNoticeVersion!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class GrantDataSubjectConsentDto {
  @IsEnum(ConsentInteractionChannel)
  grantedChannel!: ConsentInteractionChannel;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  evidenceReference!: string;
}

export class WithdrawDataSubjectConsentDto {
  @IsEnum(ConsentInteractionChannel)
  withdrawalChannel!: ConsentInteractionChannel;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  withdrawalReason!: string;
}
