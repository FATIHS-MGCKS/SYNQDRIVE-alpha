import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import {
  LEGAL_BOOKING_CHANNELS,
  LEGAL_CUSTOMER_SEGMENTS,
} from '../legal-document-scope.constants';
import { LEGAL_STATUS } from '../documents.constants';

const LEGAL_STATUSES = Object.values(LEGAL_STATUS);
const LEGAL_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'activatedAt',
  'versionLabel',
  'status',
  'documentType',
] as const;

export class LegalDocumentListQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  documentType?: string;

  @IsOptional()
  @IsIn(LEGAL_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  language?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  jurisdiction?: string;

  @IsOptional()
  @IsIn(LEGAL_CUSTOMER_SEGMENTS as unknown as string[])
  customerSegment?: string;

  @IsOptional()
  @IsIn(LEGAL_BOOKING_CHANNELS as unknown as string[])
  channelScope?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(LEGAL_SORT_FIELDS)
  sort?: (typeof LEGAL_SORT_FIELDS)[number];

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
