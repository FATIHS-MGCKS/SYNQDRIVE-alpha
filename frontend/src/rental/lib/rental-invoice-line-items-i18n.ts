/**
 * Rental Invoice Line Items presentation adapter (P2.2.53).
 * Locale-aware money display and inferred-unit labels only — no financial logic.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import type { TranslationKey } from '../../i18n/translations/en';
import { formatInvoiceListAmount } from './invoice-list-i18n';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export type InvoiceLineItemInferInput = {
  unit?: string | null;
  unitLabel?: string | null;
};

export type InferredUnitKind = 'days' | 'hours' | 'km';

function explicitUnitLabel(raw?: InvoiceLineItemInferInput): string | null {
  const explicit = raw?.unit?.trim() || raw?.unitLabel?.trim();
  return explicit || null;
}

export function inferUnitKind(
  description: string,
  raw?: InvoiceLineItemInferInput,
): InferredUnitKind | 'explicit' | null {
  if (explicitUnitLabel(raw)) return 'explicit';
  if (/\bTage\b/i.test(description)) return 'days';
  if (/\bStunden?\b/i.test(description)) return 'hours';
  if (/\bkm\b/i.test(description)) return 'km';
  return null;
}

export function inferUnitLabelBaseline(
  description: string,
  raw?: InvoiceLineItemInferInput,
): string | null {
  const kind = inferUnitKind(description, raw);
  if (kind === 'explicit') return explicitUnitLabel(raw);
  if (kind === 'days') return 'Tage';
  if (kind === 'hours') return 'Std.';
  if (kind === 'km') return 'km';
  return null;
}

export function resolveRentalInvoiceLineItemsLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function formatRentalInvoiceLineItemMoney(
  locale: string,
  cents: number,
  currency: string,
): string {
  return formatInvoiceListAmount(
    resolveRentalInvoiceLineItemsLocale(locale),
    cents,
    currency,
  );
}

export function resolveLineItemUnitDisplayLabel(
  description: string,
  raw: InvoiceLineItemInferInput | undefined,
  t: Translate,
): string | null {
  const kind = inferUnitKind(description, raw);
  if (kind === 'explicit') return explicitUnitLabel(raw);
  if (kind === 'days') return t('invoiceLineItem.unit.days');
  if (kind === 'hours') return t('invoiceLineItem.unit.hours');
  if (kind === 'km') return 'km';
  return null;
}

export function resolveLineItemFallbackDescription(t: Translate): string {
  return t('invoiceLineItem.fallback.description');
}
