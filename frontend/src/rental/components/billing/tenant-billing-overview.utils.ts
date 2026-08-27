import type { TranslationKey } from '../../i18n/translations/en';
import type {
  BillingInvoiceDto,
  TenantBillingWarningDto,
  TenantSubscriptionOverviewDto,
} from '../../types/billing.types';
import {
  resolveInvoiceNumberFallbackLabel,
  resolveOverviewHeaderBadge,
  resolvePricingModelDisplayLabel,
} from '../../lib/rental-tenant-billing-i18n';
import { headerBadgeFromSummary } from './billing.utils';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export function pricingModelLabel(model: string | null | undefined): string {
  if (model === 'GRADUATED') return 'Gestaffelter Preis';
  if (model === 'VOLUME') return 'Mengenpreis';
  return '—';
}

export function pricingModelDisplayLabel(
  model: string | null | undefined,
  t: Translate,
): string {
  return resolvePricingModelDisplayLabel(model, t);
}

export function warningTone(severity: TenantBillingWarningDto['severity']): string {
  switch (severity) {
    case 'critical':
      return 'sq-tone-critical';
    case 'warning':
      return 'sq-tone-warning';
    default:
      return 'sq-tone-info';
  }
}

export function resolveInvoiceNumberLabel(
  invoice: BillingInvoiceDto,
  t?: Translate,
): string {
  const extended = invoice as BillingInvoiceDto & {
    invoiceNumberLabel?: string | null;
    invoiceNumber?: string | null;
  };
  return (
    extended.invoiceNumberLabel?.trim() ||
    extended.invoiceNumber?.trim() ||
    (t ? resolveInvoiceNumberFallbackLabel(t) : 'Noch nicht finalisiert')
  );
}

export function overviewHeaderBadge(
  overview: TenantSubscriptionOverviewDto | null,
  t?: Translate,
): { label: string; tone: string } | null {
  if (!overview?.contract) return null;
  if (t) {
    return resolveOverviewHeaderBadge(
      overview.contract.status,
      overview.pricing?.grossAmount ? 'OK' : 'PRICE_NOT_CONFIGURED',
      t,
    );
  }
  return headerBadgeFromSummary(
    overview.contract.status,
    overview.pricing?.grossAmount ? 'OK' : 'PRICE_NOT_CONFIGURED',
  );
}

export function paymentMethodSummaryLabel(
  overview: TenantSubscriptionOverviewDto | null,
): string {
  const method = overview?.paymentMethod;
  if (!method) return '—';
  if (!method.defaultMethod) return method.statusLabel;
  const { defaultMethod } = method;
  const tail =
    defaultMethod.last4 != null
      ? `${defaultMethod.brand ?? defaultMethod.typeLabel} •••• ${defaultMethod.last4}`
      : defaultMethod.typeLabel;
  return `${method.statusLabel} · ${tail}`;
}

export function nextAmountLabel(overview: TenantSubscriptionOverviewDto | null): string {
  const amount =
    overview?.billing?.nextExpectedInvoice?.grossAmount?.formatted ??
    overview?.pricing?.grossAmount?.formatted ??
    null;
  return amount ?? '—';
}
