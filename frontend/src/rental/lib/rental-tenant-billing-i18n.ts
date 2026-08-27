/**
 * Rental Tenant Billing presentation adapter (P2.2.54 overview + shell; P2.2.55 tariff & vehicles).
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
import type {
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
  t: Translate,
): string {
  if (kind === 'RENTAL') return t('tenantBilling.tariff.planKind.rental');
  if (kind === 'FLEET') return t('tenantBilling.tariff.planKind.fleet');
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

export function resolveVehicleChangeTypeLabel(
  changeType: TenantVehicleBillingChangeDto['changeType'],
  t: Translate,
): string {
  switch (changeType) {
    case 'ADDED':
      return t('tenantBilling.tariff.changeType.added');
    case 'REMOVED':
      return t('tenantBilling.tariff.changeType.removed');
    default:
      return t('tenantBilling.tariff.changeType.changed');
  }
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
      label: t('tenantBilling.tariff.breakdown.unitPriceRow'),
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
