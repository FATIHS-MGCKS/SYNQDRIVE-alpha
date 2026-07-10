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
import { DocumentExtractionStatus, DocumentExtractionType } from '@prisma/client';
import { trimEmptyToUndefined } from '@modules/tasks/dto/task.dto';

export const DOCUMENT_EXTRACTION_MAX_PAGE_SIZE = 50;

export class ListDocumentExtractionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DOCUMENT_EXTRACTION_MAX_PAGE_SIZE)
  limit?: number;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsEnum(DocumentExtractionStatus)
  status?: DocumentExtractionStatus;

  @IsOptional()
  @IsEnum(DocumentExtractionType)
  documentType?: DocumentExtractionType;

  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  createdBy?: string;
}
