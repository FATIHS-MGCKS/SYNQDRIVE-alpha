import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  DataSubjectType,
  PrivacyPolicyLifecycleStatus,
  PrivacyProcessingDataCategory,
  PrivacyProcessingPurpose,
  ProcessingActivityDpiaStatus,
  ProcessingActivityDeletionStatus,
  ProcessingActivityOwnerRole,
  ProcessingActivityRegisterExportFormat,
} from '@prisma/client';
import type { RegisterCompletenessStatus } from './processing-activity-register.constants';

export class ListProcessingActivityRegisterQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(PrivacyPolicyLifecycleStatus)
  status?: PrivacyPolicyLifecycleStatus;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  completeness?: RegisterCompletenessStatus;

  @IsOptional()
  @IsString()
  sort?: 'title' | 'updatedAt' | 'nextReviewDate' | 'status';

  @IsOptional()
  @IsString()
  dir?: 'asc' | 'desc';

  @IsOptional()
  currentVersionOnly?: boolean;

  @IsOptional()
  @IsIn(['active', 'blocking_gaps', 'review_due', 'dpia_overdue', 'revocations_in_progress'])
  kpiFilter?:
    | 'active'
    | 'blocking_gaps'
    | 'review_due'
    | 'dpia_overdue'
    | 'revocations_in_progress';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  hasBlockingGaps?: boolean;
}

export class CreateProcessingActivityRegisterDto {
  @IsString()
  @IsNotEmpty()
  activityCode!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  purposeSummary?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(PrivacyProcessingDataCategory, { each: true })
  dataCategories?: PrivacyProcessingDataCategory[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(PrivacyProcessingPurpose, { each: true })
  purposes?: PrivacyProcessingPurpose[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(DataSubjectType, { each: true })
  dataSubjectTypes?: DataSubjectType[];

  @IsOptional()
  @IsString()
  recipientCategoriesSummary?: string;

  @IsOptional()
  @IsString()
  retentionDescription?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionPeriodDays?: number;

  @IsOptional()
  @IsString()
  technicalOrganizationalMeasures?: string;

  @IsOptional()
  @IsString()
  controllerReference?: string;

  @IsOptional()
  @IsString()
  jointControllerSummary?: string;

  @IsOptional()
  @IsDateString()
  nextReviewDate?: string;

  @IsOptional()
  @IsEnum(ProcessingActivityDpiaStatus)
  dpiaStatus?: ProcessingActivityDpiaStatus;

  @IsOptional()
  @IsEnum(ProcessingActivityOwnerRole)
  ownerRole?: ProcessingActivityOwnerRole;

  @IsOptional()
  @IsString()
  ownerUserId?: string;
}

export class UpdateProcessingActivityRegisterDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  purposeSummary?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(PrivacyProcessingDataCategory, { each: true })
  dataCategories?: PrivacyProcessingDataCategory[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(PrivacyProcessingPurpose, { each: true })
  purposes?: PrivacyProcessingPurpose[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(DataSubjectType, { each: true })
  dataSubjectTypes?: DataSubjectType[];

  @IsOptional()
  @IsString()
  recipientCategoriesSummary?: string;

  @IsOptional()
  @IsString()
  retentionDescription?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionPeriodDays?: number;

  @IsOptional()
  @IsString()
  technicalOrganizationalMeasures?: string;

  @IsOptional()
  @IsString()
  controllerReference?: string;

  @IsOptional()
  @IsString()
  jointControllerSummary?: string;

  @IsOptional()
  @IsDateString()
  nextReviewDate?: string;

  @IsOptional()
  @IsEnum(ProcessingActivityDpiaStatus)
  dpiaStatus?: ProcessingActivityDpiaStatus;

  @IsOptional()
  @IsEnum(ProcessingActivityDeletionStatus)
  deletionStatus?: ProcessingActivityDeletionStatus;

  @IsOptional()
  @IsEnum(ProcessingActivityOwnerRole)
  ownerRole?: ProcessingActivityOwnerRole;

  @IsOptional()
  @IsString()
  ownerUserId?: string;
}

export class CreateRegisterExportDto {
  @IsEnum(ProcessingActivityRegisterExportFormat)
  format!: ProcessingActivityRegisterExportFormat;

  @IsOptional()
  @IsString()
  processingActivityId?: string;
}
