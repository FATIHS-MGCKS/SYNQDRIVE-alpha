/**
 * Rental Tenant Billing presentation adapter (P2.2.54 overview + shell; P2.2.55A tariff summary/breakdown/tier ladder; P2.2.55B billable vehicles + vehicle changes; P2.2.56 tenant billing invoices list + detail; P2.2.57 tenant billing payment method).
 * Locale-aware display helpers and static TranslationKeys only.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import type { TranslationKey } from '../../i18n/translations/en';
import { formatInvoiceListAmount } from './invoice-list-i18n';
import type { TenantSubscriptionSubTab } from '../components/billing/tenant-billing-navigation';
import type { BillingStripeUiState } from '../components/billing/billing-stripe-ui';
import type {
  TenantPaymentMethodDto,
  TenantSubscriptionTariffDetailsDto,
  TenantSubscriptionTariffPricingDto,
  TenantVehicleBillingChangeDto,
} from '../types/billing.types';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export function resolveRentalTenantBillingLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function formatRentalTenantBillingMoney(
  locale: string,
  cents: number | null | undefined,
  currency = 'EUR',
): string {
  if (cents == null) return '—';
  return formatInvoiceListAmount(
    resolveRentalTenantBillingLocale(locale),
    cents,
    currency,
  );
}

export function formatRentalTenantBillingDate(
  locale: string,
  iso: string | null | undefined,
): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(resolveRentalTenantBillingLocale(locale), {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function resolveTenantBillingMoneyDisplay(
  formatted: string | null | undefined,
  locale: string,
  cents: number | null | undefined,
  currency = 'EUR',
): string {
  if (formatted) return formatted;
  return formatRentalTenantBillingMoney(locale, cents, currency);
}

export function resolveTenantBillingTabLabel(
  tab: TenantSubscriptionSubTab,
  t: Translate,
): string {
  const keyByTab: Record<TenantSubscriptionSubTab, TranslationKey> = {
    overview: 'tenantBilling.tab.overview',
    'tariff-vehicles': 'tenantBilling.tab.tariffVehicles',
    addons: 'tenantBilling.tab.addons',
    invoices: 'tenantBilling.tab.invoices',
    'payment-method': 'tenantBilling.tab.paymentMethod',
  };
  return t(keyByTab[tab]);
}

export function resolvePricingModelDisplayLabel(
  model: string | null | undefined,
  t: Translate,
): string {
  if (model === 'GRADUATED') return t('tenantBilling.pricingModel.graduated');
  if (model === 'VOLUME') return t('tenantBilling.pricingModel.volume');
  return '—';
}

export function resolveInvoiceNumberFallbackLabel(t: Translate): string {
  return t('tenantBilling.invoice.fallbackNumber');
}

export function resolveOverviewHeaderBadge(
  subscriptionStatus: string | null | undefined,
  calculationStatus: string | null | undefined,
  t: Translate,
): { label: string; tone: string } {
  if (
    calculationStatus === 'NO_ACTIVE_PRICE_VERSION' ||
    calculationStatus === 'PRICE_NOT_CONFIGURED'
  ) {
    return { label: t('tenantBilling.status.priceNotConfigured'), tone: 'sq-tone-warning' };
  }
  if (subscriptionStatus === 'PAST_DUE') {
    return { label: t('tenantBilling.status.pastDue'), tone: 'sq-tone-critical' };
  }
  if (subscriptionStatus === 'TRIALING') {
    return { label: t('tenantBilling.status.trialing'), tone: 'sq-tone-info' };
  }
  if (subscriptionStatus === 'ACTIVE') {
    return { label: t('tenantBilling.status.active'), tone: 'sq-tone-success' };
  }
  return { label: t('tenantBilling.status.prepared'), tone: 'sq-tone-warning' };
}

export function resolvePlanKindDisplayLabel(
  kind: TenantSubscriptionTariffDetailsDto['planKind'],
  _t: Translate,
): string {
  if (kind === 'RENTAL') return 'SynqDrive Rental';
  if (kind === 'FLEET') return 'SynqDrive Fleet';
  return '—';
}

export function formatTariffPeriodRangeDisplay(
  locale: string,
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start && !end) return '—';
  return `${formatRentalTenantBillingDate(locale, start)} – ${formatRentalTenantBillingDate(locale, end)}`;
}

export function formatTierRangeDisplay(
  min: number,
  max: number | null,
  t: Translate,
): string {
  if (max == null) {
    return t('tenantBilling.tariff.tierRange.openEnded', { min });
  }
  if (min === max) {
    if (min === 1) return t('tenantBilling.tariff.tierRange.singleOne');
    return t('tenantBilling.tariff.tierRange.singleExact', { count: min });
  }
  return t('tenantBilling.tariff.tierRange.range', { min, max });
}

export function buildTariffPricingBreakdownRows(
  pricing: TenantSubscriptionTariffPricingDto | null,
  t: Translate,
  locale: string,
): Array<{ label: string; value: string; emphasize?: boolean }> {
  if (!pricing) return [];

  const rows: Array<{ label: string; value: string; emphasize?: boolean }> = [
    {
      label: t('tenantBilling.overview.billableVehicles'),
      value: String(pricing.billableVehicleCount),
    },
    {
      label: t('tenantBilling.overview.pricingTier'),
      value: pricing.appliedTier?.label ?? '—',
    },
  ];

  if (pricing.pricingModel === 'GRADUATED' && pricing.tierBreakdown.length > 0) {
    // Graduated lines are rendered in a dedicated table in the UI.
  } else if (pricing.appliedTier?.unitPrice) {
    rows.push({
      label: t('tenantBilling.tariff.breakdown.unitPriceColumn'),
      value: t('tenantBilling.tariff.breakdown.unitPricePerVehicle', {
        amount: pricing.appliedTier.unitPrice.formatted,
      }),
    });
  }

  rows.push(
    {
      label: t('tenantBilling.overview.rowBase'),
      value: pricing.baseAmount?.formatted ?? '—',
    },
    ...pricing.discounts.map((discount) => ({
      label: discount.label,
      value: `−${discount.amount.formatted}`,
    })),
    {
      label: t('invoiceLineItem.summary.net'),
      value: pricing.netAmount?.formatted ?? '—',
    },
    {
      label: t('invoiceLineItem.summary.tax'),
      value: pricing.taxConfigured
        ? pricing.taxAmount?.formatted ?? '—'
        : t('tenantBilling.overview.taxMissing'),
    },
    {
      label: t('invoiceLineItem.summary.gross'),
      value: pricing.grossAmount?.formatted ?? '—',
      emphasize: true,
    },
    {
      label: t('tenantBilling.tariff.breakdown.currencyRow'),
      value: pricing.currency ?? '—',
    },
    {
      label: t('tenantBilling.tariff.breakdown.calculatedAtRow'),
      value: formatRentalTenantBillingDate(locale, pricing.calculatedAt),
    },
    {
      label: t('tenantBilling.tariff.breakdown.pricingModelRow'),
      value: resolvePricingModelDisplayLabel(pricing.pricingModel, t),
    },
  );

  return rows;
}

export function resolveVehicleChangeTypeLabel(
  changeType: TenantVehicleBillingChangeDto['changeType'],
  t: Translate,
): string {
  if (changeType === 'ADDED') return t('rentalRules.workflow.publish.kindAdded');
  if (changeType === 'REMOVED') return t('rentalRules.workflow.publish.kindRemoved');
  return t('rentalRules.workflow.publish.kindChanged');
}

export function resolveTenantInvoiceMachineStatus(invoice: {
  status?: string | null;
  dueDate?: string | null;
}): string {
  const status = (invoice.status ?? '').toUpperCase();
  if (status === 'OPEN' && invoice.dueDate && new Date(invoice.dueDate) < new Date()) {
    return 'OVERDUE';
  }
  return status || 'OPEN';
}

export function resolveTenantInvoiceStatusFallbackLabel(
  machineStatus: string,
  t: Translate,
): string {
  switch (machineStatus.toUpperCase()) {
    case 'DRAFT':
      return t('invoices.list.status.DRAFT');
    case 'OPEN':
      return t('tenantBilling.invoices.status.open');
    case 'OVERDUE':
      return t('invoices.list.status.OVERDUE');
    case 'PAID':
      return t('invoices.list.status.PAID');
    case 'VOID':
      return t('invoices.list.status.VOID');
    case 'UNCOLLECTIBLE':
      return t('tenantBilling.invoices.status.uncollectible');
    default:
      return t('tenantBilling.invoices.status.open');
  }
}

export function resolveTenantInvoiceStatusLabel(
  invoice: {
    status?: string | null;
    statusLabel?: string | null;
    dueDate?: string | null;
  },
  t: Translate,
): string {
  if (invoice.statusLabel?.trim()) return invoice.statusLabel.trim();
  return resolveTenantInvoiceStatusFallbackLabel(resolveTenantInvoiceMachineStatus(invoice), t);
}

export function resolveTenantInvoiceStatusTone(machineStatus: string): string {
  switch (machineStatus.toUpperCase()) {
    case 'PAID':
      return 'sq-tone-success';
    case 'DRAFT':
    case 'VOID':
      return 'sq-tone-neutral';
    case 'OVERDUE':
    case 'UNCOLLECTIBLE':
      return 'sq-tone-critical';
    case 'OPEN':
    default:
      return 'sq-tone-warning';
  }
}

export function resolveTenantInvoiceFilterStatusLabel(
  filter: 'all' | 'DRAFT' | 'OPEN' | 'OVERDUE' | 'PAID' | 'VOID',
  t: Translate,
): string {
  if (filter === 'all') return t('invoices.list.filters.allStatuses');
  return resolveTenantInvoiceStatusFallbackLabel(filter, t);
}

export function resolveTenantPaymentStatusLabel(
  status: string,
  statusLabel: string | null | undefined,
  t: Translate,
): string {
  if (statusLabel?.trim()) return statusLabel.trim();
  switch (status.toUpperCase()) {
    case 'PENDING':
      return t('tenantBilling.invoices.paymentStatus.pending');
    case 'SUCCEEDED':
      return t('tenantBilling.invoices.paymentStatus.succeeded');
    case 'FAILED':
      return t('tenantBilling.invoices.paymentStatus.failed');
    case 'REFUNDED':
      return t('tenantBilling.invoices.paymentStatus.refunded');
    case 'PARTIALLY_REFUNDED':
      return t('tenantBilling.invoices.paymentStatus.partiallyRefunded');
    case 'CANCELLED':
      return t('tenantBilling.invoices.paymentStatus.cancelled');
    default:
      return t('tenantBilling.invoices.paymentStatus.fallback');
  }
}

export function resolvePaymentMethodBillingStateLabel(
  state: TenantPaymentMethodDto['billingState'],
  t: Translate,
): string {
  switch (state) {
    case 'READY':
      return t('tenantBilling.paymentMethod.state.ready');
    case 'MISSING':
      return t('tenantBilling.paymentMethod.state.missing');
    case 'REQUIRES_ACTION':
      return t('tenantBilling.paymentMethod.state.requiresAction');
    case 'FAILED':
      return t('tenantBilling.paymentMethod.state.failed');
    default:
      return t('tenantBilling.paymentMethod.state.missing');
  }
}

export function resolveStripeStateLabel(state: BillingStripeUiState, t: Translate): string {
  switch (state) {
    case 'configured':
      return t('tenantBilling.paymentMethod.stripe.configured.label');
    case 'prepared':
      return t('tenantBilling.paymentMethod.stripe.prepared.label');
    default:
      return t('tenantBilling.paymentMethod.stripe.notConfigured.label');
  }
}

export function resolveStripeStateHint(state: BillingStripeUiState, t: Translate): string {
  switch (state) {
    case 'configured':
      return t('tenantBilling.paymentMethod.stripe.configured.hint');
    case 'prepared':
      return t('tenantBilling.paymentMethod.stripe.prepared.hint');
    default:
      return t('tenantBilling.paymentMethod.stripe.notConfigured.hint');
  }
}

export function formatPaymentMethodDisplayLocalized(
  method: TenantPaymentMethodDto,
  t: Translate,
): {
  title: string;
  subtitle: string;
  detail: string | null;
} {
  if (method.type === 'SEPA_DEBIT') {
    const bank = method.bankName ?? t('tenantBilling.paymentMethod.display.fallback.bankAccount');
    const last4 = method.last4 ? ` •••• ${method.last4}` : '';
    return {
      title: `${bank}${last4}`,
      subtitle: method.typeLabel,
      detail: method.mandateStatusLabel
        ? `${t('tenantBilling.paymentMethod.display.mandatePrefix')}${method.mandateStatusLabel}`
        : null,
    };
  }

  const brand = method.brand ?? t('tenantBilling.paymentMethod.display.fallback.card');
  const last4 = method.last4 ? ` •••• ${method.last4}` : '';
  const expiry =
    method.expMonth && method.expYear
      ? `${t('tenantBilling.paymentMethod.display.expiryPrefix')}${String(method.expMonth).padStart(2, '0')}/${method.expYear}`
      : null;

  return {
    title: `${brand}${last4}`,
    subtitle: method.typeLabel,
    detail: expiry,
  };
}

export type PaymentMethodDetachError =
  | {
      kind: 'host';
      code: 'detachFailed';
    }
  | {
      kind: 'raw';
      message: string;
    };

export type PaymentMethodActionError =
  | {
      source: 'setDefault';
      message: string;
    }
  | {
      source: 'detach';
      error: PaymentMethodDetachError;
    };

export function resolvePaymentMethodDetachErrorMessage(
  error: PaymentMethodDetachError | null,
  t: Translate,
): string | null {
  if (!error) return null;
  if (error.kind === 'raw') return error.message;
  return t('tenantBilling.paymentMethod.error.detachFailed');
}

export function resolvePaymentMethodActionErrorMessage(
  error: PaymentMethodActionError | null,
  t: Translate,
): string | null {
  if (!error) return null;
  if (error.source === 'setDefault') return error.message;
  return resolvePaymentMethodDetachErrorMessage(error.error, t);
}

export type StripePortalActionError =
  | {
      kind: 'host';
      code: 'notConfigured' | 'openFailed';
    }
  | {
      kind: 'raw';
      message: string;
    };

export function resolveStripePortalActionErrorMessage(
  error: StripePortalActionError | null,
  t: Translate,
): string | null {
  if (!error) return null;
  if (error.kind === 'raw') return error.message;
  if (error.code === 'notConfigured') {
    return t('tenantBilling.paymentMethod.error.portalNotConfigured');
  }
  return t('tenantBilling.paymentMethod.error.portalOpenFailed');
}
