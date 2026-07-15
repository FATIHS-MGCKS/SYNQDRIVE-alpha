import type {
  BillingInvoiceDto,
  TenantBillingWarningDto,
  TenantSubscriptionOverviewDto,
} from '../../types/billing.types';
import { headerBadgeFromSummary } from './billing.utils';

export function pricingModelLabel(model: string | null | undefined): string {
  if (model === 'GRADUATED') return 'Gestaffelter Preis';
  if (model === 'VOLUME') return 'Mengenpreis';
  return '—';
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

export function resolveInvoiceNumberLabel(invoice: BillingInvoiceDto): string {
  const extended = invoice as BillingInvoiceDto & {
    invoiceNumberLabel?: string | null;
    invoiceNumber?: string | null;
  };
  return (
    extended.invoiceNumberLabel?.trim() ||
    extended.invoiceNumber?.trim() ||
    'Noch nicht finalisiert'
  );
}

export function overviewHeaderBadge(overview: TenantSubscriptionOverviewDto | null): {
  label: string;
  tone: string;
} | null {
  if (!overview?.contract) return null;
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
