import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { InvoiceStatus } from '@prisma/client';

export class TenantInvoiceQueryDto {
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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsIn(['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE'])
  status?: InvoiceStatus;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;
}

export interface TenantMoneyDto {
  cents: number;
  currency: string;
  formatted: string;
}

export interface TenantInvoiceListItemDto {
  id: string;
  invoiceNumber: string | null;
  invoiceNumberLabel: string;
  invoiceDate: string;
  periodStart: string | null;
  periodEnd: string | null;
  status: string;
  statusLabel: string;
  netAmount: TenantMoneyDto;
  taxAmount: TenantMoneyDto | null;
  grossAmount: TenantMoneyDto;
  amountDue: TenantMoneyDto | null;
  amountRemaining: TenantMoneyDto | null;
  dueDate: string | null;
  paidAt: string | null;
  hasHostedInvoice: boolean;
  hasPdf: boolean;
}

export interface TenantInvoiceLineDto {
  description: string;
  quantity: number;
  unitAmount: TenantMoneyDto | null;
  netAmount: TenantMoneyDto;
  taxAmount: TenantMoneyDto | null;
  grossAmount: TenantMoneyDto;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface TenantInvoiceDetailDto extends TenantInvoiceListItemDto {
  amountPaid: TenantMoneyDto | null;
  voidedAt: string | null;
  lines: TenantInvoiceLineDto[];
}

export interface TenantInvoiceUrlDto {
  url: string;
}
