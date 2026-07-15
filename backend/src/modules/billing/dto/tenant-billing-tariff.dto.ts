import { TenantMoneyDto } from './tenant-subscription-overview.dto';
import { TenantBillingListQueryDto } from './tenant-billing-list-query.dto';

export class TenantBillableVehicleListQueryDto extends TenantBillingListQueryDto {
  static readonly ALLOWED_SORT_FIELDS = [
    'licensePlate',
    'make',
    'billableFrom',
    'billingStatus',
  ] as const;
}

export interface TenantSubscriptionTariffDetailsDto {
  planKind: 'RENTAL' | 'FLEET' | null;
  planName: string | null;
  billingIntervalLabel: string;
  priceVersionLabel: string | null;
  contractStartedAt: string | null;
  nextPeriodStart: string | null;
  nextPeriodEnd: string | null;
  cancellationStatusLabel: string | null;
  appliedTierLabel: string | null;
}

export interface TenantPriceTierScheduleDto {
  label: string;
  minVehicles: number;
  maxVehicles: number | null;
  unitPrice: TenantMoneyDto | null;
  isCurrent: boolean;
}

export interface TenantTierBreakdownLineDto {
  tierLabel: string;
  quantity: number;
  unitPrice: TenantMoneyDto;
  subtotal: TenantMoneyDto;
}

export interface TenantSubscriptionTariffPricingDto {
  calculatedAt: string;
  billableVehicleCount: number;
  connectedVehicleCount: number;
  pricingModel: 'VOLUME' | 'GRADUATED' | null;
  appliedTier: {
    label: string;
    minVehicles: number;
    maxVehicles: number | null;
    unitPrice: TenantMoneyDto | null;
  } | null;
  priceTiers: TenantPriceTierScheduleDto[];
  tierBreakdown: TenantTierBreakdownLineDto[];
  baseAmount: TenantMoneyDto | null;
  discounts: Array<{ label: string; amount: TenantMoneyDto }>;
  netAmount: TenantMoneyDto | null;
  taxAmount: TenantMoneyDto | null;
  grossAmount: TenantMoneyDto | null;
  currency: string | null;
  taxConfigured: boolean;
}

export interface TenantSubscriptionTariffDto {
  asOf: string;
  tariff: TenantSubscriptionTariffDetailsDto | null;
  pricing: TenantSubscriptionTariffPricingDto | null;
  sectionErrors: Array<{ section: string; message: string }>;
}

export interface TenantBillableVehicleListItemDto {
  id: string;
  licensePlate: string | null;
  make: string;
  model: string;
  vehicleLabel: string;
  stationName: string | null;
  billableFrom: string | null;
  billableUntil: string | null;
  billingStatus: 'BILLABLE' | 'EXCLUDED';
  billingStatusLabel: string;
  reasonLabel: string | null;
}

export interface TenantVehicleBillingChangeDto {
  id: string;
  licensePlate: string | null;
  vehicleLabel: string | null;
  changeType: 'ADDED' | 'REMOVED' | 'CHANGED';
  eventTypeLabel: string;
  effectiveAt: string;
  prorationAmount: TenantMoneyDto | null;
  reason: string | null;
}
