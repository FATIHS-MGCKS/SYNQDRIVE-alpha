import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { DocumentExtractionStatus } from '@prisma/client';
import { trimEmptyToUndefined } from '@modules/tasks/dto/task.dto';
import {
  type DocumentExtractionArchiveActionStatus,
  type DocumentExtractionArchiveFollowUpStatus,
} from '../document-extraction-archive-index.materializer';

export const DOCUMENT_ARCHIVE_MAX_PAGE_SIZE = 50;

export class ListDocumentExtractionArchiveQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DOCUMENT_ARCHIVE_MAX_PAGE_SIZE)
  limit?: number;

  @IsOptional()
  @IsEnum(DocumentExtractionStatus)
  status?: DocumentExtractionStatus;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  documentCategory?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  documentSubtype?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsUUID()
  bookingId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsUUID()
  uploadedBy?: string;

  @IsOptional()
  @IsISO8601()
  uploadedFrom?: string;

  @IsOptional()
  @IsISO8601()
  uploadedTo?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  fileName?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  caseReference?: string;

  @IsOptional()
  @IsEnum(['NONE', 'READY', 'APPLYING', 'SUCCEEDED', 'PARTIAL', 'FAILED'] as const)
  actionStatus?: DocumentExtractionArchiveActionStatus;

  @IsOptional()
  @IsEnum(['NONE', 'OPEN', 'ACCEPTED', 'DISMISSED', 'MIXED'] as const)
  followUpStatus?: DocumentExtractionArchiveFollowUpStatus;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  q?: string;
}
