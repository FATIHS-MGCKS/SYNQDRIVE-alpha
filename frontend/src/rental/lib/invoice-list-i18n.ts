/**
 * Rental Invoice List presentation helpers.
 * Machine status/filter/sort values stay unchanged; labels resolve via TranslationKey.
 */
import type { StatusTone } from '../../components/patterns/status-utils';
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { InvoiceListMeta } from '../components/invoices/invoiceTypes';

export type InvoiceDirectionFilter = 'all' | 'outgoing' | 'incoming';

export type InvoiceListSortField = 'invoiceDate' | 'dueDate' | 'totalGross' | 'status' | 'createdAt';
export type InvoiceListSortOrder = 'asc' | 'desc';

export type InvoiceDocumentStatusFilter = 'all' | 'present' | 'missing' | 'failed';
export type InvoiceSendStatusFilter =
  | 'all'
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'SENT_SIMULATED';

export const INVOICE_STATUS_FILTER_OPTIONS = [
  'all',
  'DRAFT',
  'ISSUED',
  'SENT',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'NEEDS_REVIEW',
  'CANCELLED',
] as const;

export const INVOICE_TYPE_FILTER_VALUES = [
  'all',
  'OUTGOING_BOOKING',
  'OUTGOING_MANUAL',
  'OUTGOING_FINAL',
  'INCOMING_VENDOR',
  'INCOMING_UPLOADED',
] as const;

export const INVOICE_DOCUMENT_STATUS_FILTER_VALUES = [
  'all',
  'present',
  'missing',
  'failed',
] as const satisfies readonly InvoiceDocumentStatusFilter[];

export const INVOICE_SEND_STATUS_FILTER_VALUES = [
  'all',
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
  'SENT_SIMULATED',
] as const satisfies readonly InvoiceSendStatusFilter[];

export const INVOICE_SORT_VALUES = [
  'invoiceDate',
  'dueDate',
  'totalGross',
  'status',
  'createdAt',
] as const satisfies readonly InvoiceListSortField[];

export const INVOICE_DIRECTION_VALUES = ['all', 'outgoing', 'incoming'] as const satisfies readonly InvoiceDirectionFilter[];

const INVOICE_STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  DRAFT: 'invoices.list.status.DRAFT',
  ISSUED: 'invoices.list.status.ISSUED',
  SENT: 'invoices.list.status.SENT',
  PARTIALLY_PAID: 'invoices.list.status.PARTIALLY_PAID',
  PAID: 'invoices.list.status.PAID',
  OVERDUE: 'invoices.list.status.OVERDUE',
  CANCELLED: 'invoices.list.status.CANCELLED',
  CREDITED: 'invoices.list.status.CREDITED',
  VOID: 'invoices.list.status.VOID',
  UPLOADED: 'invoices.list.status.UPLOADED',
  NEEDS_REVIEW: 'invoices.list.status.NEEDS_REVIEW',
  APPROVED: 'invoices.list.status.APPROVED',
  BOOKED: 'invoices.list.status.BOOKED',
  REJECTED: 'invoices.list.status.REJECTED',
};

const INVOICE_TYPE_LABEL_KEYS: Record<string, TranslationKey> = {
  OUTGOING_BOOKING: 'invoices.list.type.OUTGOING_BOOKING',
  OUTGOING_MANUAL: 'invoices.list.type.OUTGOING_MANUAL',
  OUTGOING_FINAL: 'invoices.list.type.OUTGOING_FINAL',
  INCOMING_VENDOR: 'invoices.list.type.INCOMING_VENDOR',
  INCOMING_UPLOADED: 'invoices.list.type.INCOMING_UPLOADED',
};

const DOCUMENT_FILTER_LABEL_KEYS: Record<Exclude<InvoiceDocumentStatusFilter, 'all'>, TranslationKey> = {
  present: 'invoices.list.documentFilter.present',
  missing: 'invoices.list.documentFilter.missing',
  failed: 'invoices.list.documentFilter.failed',
};

const SEND_FILTER_LABEL_KEYS: Record<Exclude<InvoiceSendStatusFilter, 'all'>, TranslationKey> = {
  QUEUED: 'invoices.list.sendFilter.QUEUED',
  SENDING: 'invoices.list.sendFilter.SENDING',
  SENT: 'invoices.list.sendFilter.SENT',
  FAILED: 'invoices.list.sendFilter.FAILED',
  SENT_SIMULATED: 'invoices.list.sendFilter.SENT_SIMULATED',
};

const SORT_LABEL_KEYS: Record<InvoiceListSortField, TranslationKey> = {
  invoiceDate: 'invoices.list.sort.invoiceDate',
  dueDate: 'invoices.list.sort.dueDate',
  totalGross: 'invoices.list.sort.totalGross',
  status: 'invoices.list.sort.status',
  createdAt: 'invoices.list.sort.createdAt',
};

const DIRECTION_LABEL_KEYS: Record<InvoiceDirectionFilter, TranslationKey> = {
  all: 'invoices.list.direction.all',
  outgoing: 'invoices.list.direction.outgoing',
  incoming: 'invoices.list.direction.incoming',
};

const DOCUMENT_STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  DRAFT: 'invoices.list.documentStatus.DRAFT',
  GENERATED: 'invoices.list.documentStatus.GENERATED',
  SENT: 'invoices.list.documentStatus.SENT',
  VOID: 'invoices.list.documentStatus.VOID',
  FAILED: 'invoices.list.documentStatus.FAILED',
  UNKNOWN: 'invoices.list.documentStatus.UNKNOWN',
};

const SEND_STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  QUEUED: 'invoices.list.sendStatus.QUEUED',
  SENDING: 'invoices.list.sendStatus.SENDING',
  SENT: 'invoices.list.sendStatus.SENT',
  FAILED: 'invoices.list.sendStatus.FAILED',
  SENT_SIMULATED: 'invoices.list.sendStatus.SENT_SIMULATED',
  DELIVERED: 'invoices.list.sendStatus.DELIVERED',
  BOUNCED: 'invoices.list.sendStatus.BOUNCED',
};

export const INVOICE_LIST_STATUS_STYLES: Record<
  string,
  { bg: string; text: string; dot: string }
> = {
  DRAFT: { bg: 'bg-status-nodata-soft', text: 'text-status-nodata', dot: 'bg-status-nodata' },
  ISSUED: { bg: 'bg-status-info-soft', text: 'text-status-info', dot: 'bg-status-info' },
  SENT: { bg: 'bg-status-info-soft', text: 'text-status-info', dot: 'bg-status-info' },
  PARTIALLY_PAID: { bg: 'bg-status-watch-soft', text: 'text-status-watch', dot: 'bg-status-watch' },
  PAID: { bg: 'bg-status-positive-soft', text: 'text-status-positive', dot: 'bg-status-positive' },
  OVERDUE: { bg: 'bg-status-critical-soft', text: 'text-status-critical', dot: 'bg-status-critical' },
  CANCELLED: { bg: 'bg-status-nodata-soft', text: 'text-status-nodata', dot: 'bg-status-nodata' },
  CREDITED: { bg: 'bg-status-ai-soft', text: 'text-status-ai', dot: 'bg-status-ai' },
  VOID: { bg: 'bg-status-nodata-soft', text: 'text-status-nodata', dot: 'bg-status-nodata' },
  UPLOADED: { bg: 'bg-status-ai-soft', text: 'text-status-ai', dot: 'bg-status-ai' },
  NEEDS_REVIEW: { bg: 'bg-status-watch-soft', text: 'text-status-watch', dot: 'bg-status-watch' },
  APPROVED: { bg: 'bg-status-positive-soft', text: 'text-status-positive', dot: 'bg-status-positive' },
  BOOKED: { bg: 'bg-status-info-soft', text: 'text-status-info', dot: 'bg-status-info' },
  REJECTED: { bg: 'bg-status-critical-soft', text: 'text-status-critical', dot: 'bg-status-critical' },
};

export function resolveInvoiceListLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function ili(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveInvoiceListLocale(locale), key, vars).text;
}

export function invoiceListFormattingLocale(locale: string): string {
  return resolveInvoiceListLocale(locale) === 'de' ? 'de-DE' : 'en-US';
}

export function formatInvoiceListAmount(locale: string, cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat(invoiceListFormattingLocale(locale), {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function formatInvoiceListDate(locale: string, iso: string | null): string {
  if (!iso) return ili(locale, 'invoices.list.emptyValue');
  return new Date(iso).toLocaleDateString(invoiceListFormattingLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function labelInvoiceListStatus(locale: string, status: string): string {
  const key = INVOICE_STATUS_LABEL_KEYS[status] ?? INVOICE_STATUS_LABEL_KEYS.DRAFT;
  return ili(locale, key);
}

export function invoiceListStatusStyle(status: string) {
  return INVOICE_LIST_STATUS_STYLES[status] ?? INVOICE_LIST_STATUS_STYLES.DRAFT;
}

export function labelInvoiceListType(locale: string, type: string): string {
  const key = INVOICE_TYPE_LABEL_KEYS[type];
  return key ? ili(locale, key) : type;
}

export function labelInvoiceListDirection(locale: string, direction: InvoiceDirectionFilter): string {
  return ili(locale, DIRECTION_LABEL_KEYS[direction]);
}

export function labelInvoiceListDocumentFilter(
  locale: string,
  value: InvoiceDocumentStatusFilter,
): string {
  if (value === 'all') return ili(locale, 'invoices.list.filters.allDocuments');
  return ili(locale, DOCUMENT_FILTER_LABEL_KEYS[value]);
}

export function labelInvoiceListSendFilter(locale: string, value: InvoiceSendStatusFilter): string {
  if (value === 'all') return ili(locale, 'invoices.list.filters.allSendStatuses');
  return ili(locale, SEND_FILTER_LABEL_KEYS[value]);
}

export function labelInvoiceListSortField(locale: string, field: InvoiceListSortField): string {
  return ili(locale, SORT_LABEL_KEYS[field]);
}

export function labelInvoiceListDocumentStatus(
  locale: string,
  status: string | null | undefined,
): string {
  if (!status) return ili(locale, 'invoices.list.documentStatus.none');
  const key = DOCUMENT_STATUS_LABEL_KEYS[status];
  return key ? ili(locale, key) : status;
}

export function labelInvoiceListSendStatus(
  locale: string,
  status: string | null | undefined,
): string {
  if (!status) return ili(locale, 'invoices.list.sendStatus.none');
  const key = SEND_STATUS_LABEL_KEYS[status];
  return key ? ili(locale, key) : status;
}

export function documentStatusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'noData';
  if (status === 'FAILED') return 'critical';
  if (status === 'GENERATED' || status === 'SENT') return 'success';
  if (status === 'DRAFT') return 'neutral';
  if (status === 'VOID') return 'neutral';
  return 'info';
}

export function sendStatusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'noData';
  if (status === 'FAILED' || status === 'BOUNCED') return 'critical';
  if (status === 'SENT' || status === 'DELIVERED' || status === 'SENT_SIMULATED') return 'success';
  if (status === 'SENDING' || status === 'QUEUED') return 'warning';
  return 'neutral';
}

export function invoiceListPaginationLabel(locale: string, meta: InvoiceListMeta | null): string {
  if (!meta || meta.total === 0) return ili(locale, 'invoices.list.pagination.zero');
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);
  return ili(locale, 'invoices.list.pagination.range', { from, to, total: meta.total });
}

export function counterpartyDisplayName(
  item: {
    direction: string;
    supplierDisplayName?: string | null;
    customerDisplayName?: string | null;
  },
  locale: string,
): string {
  const empty = ili(locale, 'invoices.list.emptyValue');
  if (item.direction === 'incoming') {
    return item.supplierDisplayName?.trim() || item.customerDisplayName?.trim() || empty;
  }
  return item.customerDisplayName?.trim() || item.supplierDisplayName?.trim() || empty;
}

export function vehicleDisplayLine(
  item: {
    licensePlate?: string | null;
    vehicleDisplayName?: string | null;
  },
  locale: string,
): string {
  const empty = ili(locale, 'invoices.list.emptyValue');
  const plate = item.licensePlate?.trim();
  const name = item.vehicleDisplayName?.trim();
  if (name && plate) return `${name} · ${plate}`;
  return name || plate || empty;
}

export const INVOICE_LIST_LOAD_ERROR_KEY = 'invoices.list.error.loadFailed' as const;
