/**
 * Rental Tenant Billing presentation adapter (P2.2.54 — overview + shell).
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
