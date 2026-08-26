import type { OrgInvoiceStatus } from './invoiceTypes';
import { isOutgoingInvoice } from './invoiceClassification';
import {
  formatInvoiceListAmount,
  formatInvoiceListDate,
  labelInvoiceListStatus,
} from '../../lib/invoice-list-i18n';

export const STATUS_MAP: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  DRAFT: { label: 'Entwurf', bg: 'bg-status-nodata-soft', text: 'text-status-nodata', dot: 'bg-status-nodata' },
  ISSUED: { label: 'Ausgestellt', bg: 'bg-status-info-soft', text: 'text-status-info', dot: 'bg-status-info' },
  SENT: { label: 'Gesendet', bg: 'bg-status-info-soft', text: 'text-status-info', dot: 'bg-status-info' },
  PARTIALLY_PAID: { label: 'Teilweise bezahlt', bg: 'bg-status-watch-soft', text: 'text-status-watch', dot: 'bg-status-watch' },
  PAID: { label: 'Bezahlt', bg: 'bg-status-positive-soft', text: 'text-status-positive', dot: 'bg-status-positive' },
  OVERDUE: { label: 'Überfällig', bg: 'bg-status-critical-soft', text: 'text-status-critical', dot: 'bg-status-critical' },
  CANCELLED: { label: 'Storniert', bg: 'bg-status-nodata-soft', text: 'text-status-nodata', dot: 'bg-status-nodata' },
  CREDITED: { label: 'Gutgeschrieben', bg: 'bg-status-ai-soft', text: 'text-status-ai', dot: 'bg-status-ai' },
  VOID: { label: 'Ungültig', bg: 'bg-status-nodata-soft', text: 'text-status-nodata', dot: 'bg-status-nodata' },
  UPLOADED: { label: 'Hochgeladen', bg: 'bg-status-ai-soft', text: 'text-status-ai', dot: 'bg-status-ai' },
  NEEDS_REVIEW: { label: 'Prüfung nötig', bg: 'bg-status-watch-soft', text: 'text-status-watch', dot: 'bg-status-watch' },
  APPROVED: { label: 'Freigegeben', bg: 'bg-status-positive-soft', text: 'text-status-positive', dot: 'bg-status-positive' },
  BOOKED: { label: 'Verbucht', bg: 'bg-status-info-soft', text: 'text-status-info', dot: 'bg-status-info' },
  REJECTED: { label: 'Abgelehnt', bg: 'bg-status-critical-soft', text: 'text-status-critical', dot: 'bg-status-critical' },
};

export function isOutgoing(type: string) {
  return isOutgoingInvoice(type);
}

export function displayNumber(
  inv: { invoiceNumberDisplay?: string; invoiceNumber?: number | null; status?: string },
  locale?: string,
) {
  if (inv.invoiceNumberDisplay) return inv.invoiceNumberDisplay;
  if (inv.invoiceNumber != null) return `#${inv.invoiceNumber}`;
  if (locale) return labelInvoiceListStatus(locale, 'DRAFT');
  return STATUS_MAP.DRAFT.label;
}

export function formatAmount(cents: number, currency = 'EUR', locale?: string): string {
  if (locale) {
    return formatInvoiceListAmount(locale, cents, currency);
  }
  return formatInvoiceListAmount('de', cents, currency);
}

export function formatDate(iso: string | null, locale?: string): string {
  if (locale) {
    return formatInvoiceListDate(locale, iso);
  }
  return formatInvoiceListDate('de', iso);
}

export function canIssue(status: string, type: string): boolean {
  return isOutgoing(type) && status === 'DRAFT';
}

export function canMarkSent(status: string, type: string): boolean {
  return isOutgoing(type) && ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'].includes(status);
}

export function canRecordPayment(status: OrgInvoiceStatus | string): boolean {
  return !['CANCELLED', 'VOID', 'CREDITED', 'REJECTED', 'DRAFT'].includes(status);
}

export function canCancelInvoice(
  status: OrgInvoiceStatus | string,
  paidCents: number,
  totalCents: number,
): boolean {
  if (['CANCELLED', 'VOID', 'CREDITED', 'REJECTED', 'PAID'].includes(status)) return false;
  if (totalCents > 0 && paidCents >= totalCents) return false;
  return true;
}

export const INVOICE_EXTRACTION_FIELDS = [
  { key: 'title', label: 'Titel' },
  { key: 'vendorName', label: 'Lieferant' },
  { key: 'totalCents', label: 'Betrag (Cent)' },
  { key: 'invoiceDate', label: 'Rechnungsdatum' },
  { key: 'dueDate', label: 'Fälligkeitsdatum' },
  { key: 'description', label: 'Beschreibung' },
  { key: 'invoiceNumber', label: 'Externe Rechnungsnr.' },
];
