import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ServiceCaseCategory,
  ServiceCaseSource,
  ServiceCaseStatus,
  TaskPriority,
} from '@prisma/client';
import { trimEmptyToUndefined } from './service-case.dto.utils';

export class CreateServiceCaseDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsEnum(ServiceCaseCategory)
  category!: ServiceCaseCategory;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsEnum(ServiceCaseSource)
  source?: ServiceCaseSource;

  @Transform(trimEmptyToUndefined)
  @IsString()
  vehicleId!: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  vendorId?: string;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  @IsISO8601()
  expectedReadyAt?: string;

  @IsOptional()
  @IsISO8601()
  downtimeStart?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedCostCents?: number;

  @IsOptional()
  blocksRental?: boolean;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  documentId?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class UpdateServiceCaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsEnum(ServiceCaseCategory)
  category?: ServiceCaseCategory;

  @IsOptional()
  @IsEnum(ServiceCaseStatus)
  status?: ServiceCaseStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  vendorId?: string | null;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string | null;

  @IsOptional()
  @IsISO8601()
  expectedReadyAt?: string | null;

  @IsOptional()
  @IsISO8601()
  downtimeStart?: string | null;

  @IsOptional()
  @IsISO8601()
  downtimeEnd?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedCostCents?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  actualCostCents?: number | null;

  @IsOptional()
  blocksRental?: boolean;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  documentId?: string | null;
}

export class CompleteServiceCaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  completionNotes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  actualCostCents?: number;

  @IsOptional()
  @IsISO8601()
  downtimeEnd?: string;
}

export class ListServiceCasesQueryDto {
  @IsOptional()
  @IsEnum(ServiceCaseStatus)
  status?: ServiceCaseStatus;

  @IsOptional()
  @IsEnum(ServiceCaseCategory)
  category?: ServiceCaseCategory;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsEnum(ServiceCaseSource)
  source?: ServiceCaseSource;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  vendorId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  blocksRental?: boolean;

  @IsOptional()
  @IsISO8601()
  scheduledFrom?: string;

  @IsOptional()
  @IsISO8601()
  scheduledTo?: string;

  @IsOptional()
  @IsISO8601()
  expectedReadyFrom?: string;

  @IsOptional()
  @IsISO8601()
  expectedReadyTo?: string;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  cursor?: string;
}

export class AddServiceCaseCommentDto {
  @IsString()
  @MaxLength(4000)
  body!: string;
}

export class AddServiceCaseAttachmentDto {
  @IsString()
  @MaxLength(2000)
  fileUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  mimeType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  size?: number;
}
