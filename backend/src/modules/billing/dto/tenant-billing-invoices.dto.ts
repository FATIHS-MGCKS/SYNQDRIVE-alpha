import { IsIn, IsOptional } from 'class-validator';
import { InvoiceStatus } from '@prisma/client';
import { TenantBillingListQueryDto } from './tenant-billing-list-query.dto';

export class TenantInvoiceQueryDto extends TenantBillingListQueryDto {
  static readonly ALLOWED_SORT_FIELDS = [
    'invoiceDate',
    'dueDate',
    'amount',
    'status',
    'invoiceNumber',
  ] as const;

  @IsOptional()
  @IsIn(['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE'])
  declare status?: InvoiceStatus;
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
