/**
 * Rental Create Invoice Dialog presentation helpers.
 * Machine invoice types, template IDs, tax rates, and API payloads stay unchanged.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  getFormattingLocale,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';

/** Persisted invoice type values — never translate for API payloads. */
export const CREATE_INVOICE_TYPE_VALUES = ['OUTGOING_MANUAL', 'INCOMING_VENDOR'] as const;
export type CreateInvoiceTypeValue = (typeof CREATE_INVOICE_TYPE_VALUES)[number];

/** Template IDs from invoice-detail.constants — machine values only. */
export const CREATE_INVOICE_TEMPLATE_IDS = ['standard', 'booking', 'damage', 'extra'] as const;
export type CreateInvoiceTemplateId = (typeof CREATE_INVOICE_TEMPLATE_IDS)[number];

/** Display-only VAT rate used in outgoing line-item calculations (payload taxRate). */
export const CREATE_INVOICE_VAT_RATE = 19;

const TYPE_LABEL_KEYS: Record<CreateInvoiceTypeValue, TranslationKey> = {
  OUTGOING_MANUAL: 'invoices.list.type.OUTGOING_MANUAL',
  INCOMING_VENDOR: 'invoices.list.type.INCOMING_VENDOR',
};

const TYPE_DESC_KEYS: Record<CreateInvoiceTypeValue, TranslationKey> = {
  OUTGOING_MANUAL: 'invoices.create.type.outgoing.desc',
  INCOMING_VENDOR: 'invoices.create.type.incoming.desc',
};

const TEMPLATE_NAME_KEYS: Record<CreateInvoiceTemplateId, TranslationKey> = {
  standard: 'invoices.create.template.standard.name',
  booking: 'invoices.create.template.booking.name',
  damage: 'invoices.create.template.damage.name',
  extra: 'invoices.create.template.extra.name',
};

const TEMPLATE_DESC_KEYS: Record<CreateInvoiceTemplateId, TranslationKey> = {
  standard: 'invoices.create.template.standard.description',
  booking: 'invoices.create.template.booking.description',
  damage: 'invoices.create.template.damage.description',
  extra: 'invoices.create.template.extra.description',
};

export function resolveCreateInvoiceLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function ci(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveCreateInvoiceLocale(locale), key, vars).text;
}

export function createInvoiceFormattingLocale(locale: string): string {
  return getFormattingLocale(resolveCreateInvoiceLocale(locale));
}

export function formatCreateInvoiceAmount(
  locale: string,
  cents: number,
  currency = 'EUR',
): string {
  return new Intl.NumberFormat(createInvoiceFormattingLocale(locale), {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function labelCreateInvoiceType(locale: string, type: string): string {
  const key = TYPE_LABEL_KEYS[type as CreateInvoiceTypeValue];
  return key ? ci(locale, key) : type;
}

export function descCreateInvoiceType(locale: string, type: string): string {
  const key = TYPE_DESC_KEYS[type as CreateInvoiceTypeValue];
  return key ? ci(locale, key) : '';
}

export function labelCreateInvoiceTemplateName(locale: string, templateId: string): string {
  const key = TEMPLATE_NAME_KEYS[templateId as CreateInvoiceTemplateId];
  return key ? ci(locale, key) : templateId;
}

export function labelCreateInvoiceTemplateDescription(locale: string, templateId: string): string {
  const key = TEMPLATE_DESC_KEYS[templateId as CreateInvoiceTemplateId];
  return key ? ci(locale, key) : '';
}

export const CREATE_INVOICE_ERROR_KEY = 'invoices.create.error.createFailed' as const;
