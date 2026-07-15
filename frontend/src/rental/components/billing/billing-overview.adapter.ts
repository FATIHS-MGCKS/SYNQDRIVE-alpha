import type { BillingSummaryDto } from '../../types/billing.types';

export interface TenantSubscriptionOverviewLike {
  plan?: { kind: string; name: string } | null;
  contract?: {
    status: string;
    statusLabel: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancellationScheduledAt?: string | null;
  } | null;
  pricing?: {
    billableVehicleCount: number;
    connectedVehicleCount: number;
    grossAmount?: { cents: number; currency: string } | null;
    appliedTier?: {
      minVehicles: number;
      maxVehicles: number | null;
      unitPrice?: { cents: number | null; currency: string } | null;
    } | null;
  } | null;
  paymentMethod?: {
    status: string;
    defaultMethod?: {
      type: string;
      brand?: string | null;
      last4?: string | null;
      expMonth?: number | null;
      expYear?: number | null;
    } | null;
  } | null;
  billing?: {
    nextExpectedInvoice?: {
      periodStart: string;
      periodEnd: string;
      grossAmount?: { cents: number; currency: string } | null;
    } | null;
    nextChargeAt?: string | null;
  } | null;
  warnings?: Array<{ severity: string; message: string }>;
}

export function mapOverviewToSummaryShape(
  overview: TenantSubscriptionOverviewLike,
  orgId: string,
): BillingSummaryDto {
  const currency =
    overview.pricing?.grossAmount?.currency ??
    overview.pricing?.appliedTier?.unitPrice?.currency ??
    'EUR';

  return {
    organizationId: orgId,
    subscription: overview.contract
      ? {
          id: 'overview',
          status: overview.contract.status,
          cancelAtPeriodEnd: Boolean(overview.contract.cancellationScheduledAt),
        }
      : null,
    subscriptionStatus: overview.contract?.status ?? null,
    currentPeriodStart: overview.contract?.currentPeriodStart ?? '',
    currentPeriodEnd: overview.contract?.currentPeriodEnd ?? '',
    cancelAtPeriodEnd: Boolean(overview.contract?.cancellationScheduledAt),
    products: overview.plan
      ? [
          {
            slug: overview.plan.kind,
            name: overview.plan.name,
            plan: overview.plan.kind,
            planDisplay: overview.plan.name,
            status: overview.contract?.status ?? 'ACTIVE',
          },
        ]
      : [],
    billingModel: 'PER_CONNECTED_VEHICLE',
    connectedVehicleCount: overview.pricing?.connectedVehicleCount ?? 0,
    billableVehicleCount: overview.pricing?.billableVehicleCount ?? 0,
    currentTier: overview.pricing?.appliedTier
      ? {
          id: null,
          minVehicles: overview.pricing.appliedTier.minVehicles,
          maxVehicles: overview.pricing.appliedTier.maxVehicles,
          unitPriceCents: overview.pricing.appliedTier.unitPrice?.cents ?? null,
          currency,
          status: 'CONFIGURED',
        }
      : null,
    priceBook: {
      id: 'overview',
      name: overview.plan?.name ?? 'SynqDrive',
      currency,
      interval: overview.contract ? 'MONTH' : 'MONTH',
    },
    activePriceVersion: null,
    priceTiers: [],
    stripePortalPrepared: false,
    stripeConfigured: overview.paymentMethod?.status === 'READY',
    calculationStatus: 'OK',
    nextInvoicePreview: {
      subtotalCents: overview.pricing?.grossAmount?.cents ?? null,
      taxCents: null,
      totalCents: overview.billing?.nextExpectedInvoice?.grossAmount?.cents ?? null,
      currency,
      periodStart: overview.billing?.nextExpectedInvoice?.periodStart ?? overview.contract?.currentPeriodStart ?? '',
      periodEnd: overview.billing?.nextExpectedInvoice?.periodEnd ?? overview.contract?.currentPeriodEnd ?? '',
      explanation: '',
    },
    paymentMethod: {
      exists: overview.paymentMethod?.status === 'READY',
      type: overview.paymentMethod?.defaultMethod?.type,
      brand: overview.paymentMethod?.defaultMethod?.brand,
      last4: overview.paymentMethod?.defaultMethod?.last4,
      expMonth: overview.paymentMethod?.defaultMethod?.expMonth,
      expYear: overview.paymentMethod?.defaultMethod?.expYear,
      status: overview.paymentMethod?.status,
    },
    warnings: (overview.warnings ?? []).map((warning) => warning.message),
  };
}
