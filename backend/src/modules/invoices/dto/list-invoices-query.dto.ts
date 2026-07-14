import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OrgInvoiceStatus, OrgInvoiceType, OutboundEmailStatus } from '@prisma/client';
import { PaginationParams } from '@shared/utils/pagination';
import type { InvoiceListDocumentFilter } from './invoice-list-item.dto';

function trimEmpty({ value }: { value: unknown }): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? undefined : t;
  }
  return value;
}

function parseBoolean({ value }: { value: unknown }): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
}

export type InvoiceListSortField =
  | 'invoiceDate'
  | 'dueDate'
  | 'totalGross'
  | 'status'
  | 'invoiceNumber'
  | 'createdAt';

export class ListInvoicesQueryDto implements PaginationParams {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(trimEmpty)
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(OrgInvoiceType)
  type?: OrgInvoiceType;

  @IsOptional()
  @IsEnum(OrgInvoiceStatus)
  status?: OrgInvoiceStatus;

  @IsOptional()
  @IsIn(['outgoing', 'incoming'])
  direction?: 'outgoing' | 'incoming';

  @IsOptional()
  @IsISO8601()
  dueFrom?: string;

  @IsOptional()
  @IsISO8601()
  dueTo?: string;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  overdue?: boolean;

  @IsOptional()
  @IsIn(['present', 'missing', 'failed'])
  documentStatus?: InvoiceListDocumentFilter;

  @IsOptional()
  @IsEnum(OutboundEmailStatus)
  sendStatus?: OutboundEmailStatus;

  @IsOptional()
  @IsUUID()
  stationId?: string;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  includeVoid?: boolean;

  @IsOptional()
  @IsIn(['invoiceDate', 'dueDate', 'totalGross', 'status', 'invoiceNumber', 'createdAt'])
  sortBy?: InvoiceListSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
