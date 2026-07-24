import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  PrivacyProcessingDataCategory,
  ProcessingActivityDeletionMethod,
  ProcessingActivityRetentionClass,
  RetentionStartEvent,
} from '@prisma/client';

export class UpsertRetentionPolicyDto {
  @IsOptional()
  @IsEnum(PrivacyProcessingDataCategory)
  dataCategory?: PrivacyProcessingDataCategory;

  @IsEnum(ProcessingActivityRetentionClass)
  retentionClass!: ProcessingActivityRetentionClass;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionDurationDays?: number;

  @IsEnum(RetentionStartEvent)
  retentionStartEvent!: RetentionStartEvent;

  @IsEnum(ProcessingActivityDeletionMethod)
  deletionMethod!: ProcessingActivityDeletionMethod;

  @IsOptional()
  @IsBoolean()
  anonymizationAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  legalHold?: boolean;

  @IsOptional()
  @IsString()
  legalHoldReason?: string;

  @IsOptional()
  @IsString()
  legalHoldOwnerUserId?: string;

  @IsOptional()
  @IsDateString()
  deletionDueAt?: string;

  @IsOptional()
  @IsDateString()
  reviewDate?: string;

  @IsOptional()
  @IsString()
  ownerUserId?: string;
}

export class CreateRetentionExceptionDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsDateString()
  extendsUntil?: string;
}

export class RunDeletionJobDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsString()
  retentionPolicyId?: string;

  @IsOptional()
  @IsString()
  trigger?: string;
}

export class AssessRevocationRetentionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
