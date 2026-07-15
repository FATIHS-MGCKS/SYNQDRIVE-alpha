import { BillingDomainEventOutboxDeliveryStatus } from '@prisma/client';
import { IsIn, IsOptional } from 'class-validator';
import { TenantMoneyDto } from './tenant-billing-invoices.dto';
import { TenantBillingListQueryDto } from './tenant-billing-list-query.dto';

export class TenantVehicleLicenseQueryDto extends TenantBillingListQueryDto {
  static readonly ALLOWED_SORT_FIELDS = [
    'effectiveAt',
    'eventType',
    'licensePlate',
  ] as const;
}

export class TenantPaymentListQueryDto extends TenantBillingListQueryDto {
  static readonly ALLOWED_SORT_FIELDS = [
    'succeededAt',
    'failedAt',
    'amount',
    'status',
    'invoiceDate',
  ] as const;
}

export class TenantContractHistoryQueryDto extends TenantBillingListQueryDto {
  static readonly ALLOWED_SORT_FIELDS = ['occurredAt', 'action', 'status'] as const;
}

export class TenantBillingEmailHistoryQueryDto extends TenantBillingListQueryDto {
  static readonly ALLOWED_SORT_FIELDS = ['sentAt', 'status', 'eventType'] as const;

  @IsOptional()
  @IsIn([
    'PENDING',
    'PROCESSING',
    'DELIVERED',
    'DEAD_LETTER',
    'FAILED',
  ])
  declare status?: BillingDomainEventOutboxDeliveryStatus;
}

export interface TenantVehicleLicenseListItemDto {
  id: string;
  licensePlate: string | null;
  vehicleLabel: string | null;
  eventType: string;
  eventTypeLabel: string;
  billingStatusLabel: string;
  effectiveAt: string;
  reason: string | null;
}

export interface TenantContractHistoryItemDto {
  id: string;
  occurredAt: string;
  actionLabel: string;
  statusLabel: string | null;
  summary: string;
}

export interface TenantBillingEmailHistoryItemDto {
  id: string;
  sentAt: string;
  eventTypeLabel: string;
  statusLabel: string;
  recipientMasked: string | null;
  invoiceNumberLabel: string | null;
}

export interface TenantPaymentListItemDto {
  id: string;
  invoiceId: string;
  invoiceNumberLabel: string;
  amount: TenantMoneyDto;
  status: string;
  statusLabel: string;
  providerLabel: string;
  succeededAt: string | null;
  failedAt: string | null;
  refundedAmount: TenantMoneyDto | null;
  remainingAmount: TenantMoneyDto | null;
}
