import type { OrgInvoiceStatus } from './invoiceTypes';

export const STATUS_MAP: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  DRAFT: { label: 'Entwurf', bg: 'bg-gray-500/15', text: 'text-gray-400', dot: 'bg-gray-400' },
  ISSUED: { label: 'Ausgestellt', bg: 'bg-indigo-500/15', text: 'text-indigo-500', dot: 'bg-indigo-500' },
  SENT: { label: 'Gesendet', bg: 'bg-blue-500/15', text: 'text-blue-500', dot: 'bg-blue-500' },
  PARTIALLY_PAID: { label: 'Teilweise bezahlt', bg: 'bg-amber-500/15', text: 'text-amber-500', dot: 'bg-amber-500' },
  PAID: { label: 'Bezahlt', bg: 'bg-emerald-500/15', text: 'text-emerald-500', dot: 'bg-emerald-500' },
  OVERDUE: { label: 'Überfällig', bg: 'bg-red-500/15', text: 'text-red-500', dot: 'bg-red-500' },
  CANCELLED: { label: 'Storniert', bg: 'bg-gray-500/15', text: 'text-gray-400', dot: 'bg-gray-400' },
  CREDITED: { label: 'Gutgeschrieben', bg: 'bg-violet-500/15', text: 'text-violet-500', dot: 'bg-violet-500' },
  VOID: { label: 'Ungültig', bg: 'bg-gray-500/15', text: 'text-gray-400', dot: 'bg-gray-400' },
  UPLOADED: { label: 'Hochgeladen', bg: 'bg-purple-500/15', text: 'text-purple-500', dot: 'bg-purple-500' },
  NEEDS_REVIEW: { label: 'Prüfung nötig', bg: 'bg-amber-500/15', text: 'text-amber-500', dot: 'bg-amber-500' },
  APPROVED: { label: 'Freigegeben', bg: 'bg-emerald-500/15', text: 'text-emerald-500', dot: 'bg-emerald-500' },
  BOOKED: { label: 'Verbucht', bg: 'bg-blue-500/15', text: 'text-blue-500', dot: 'bg-blue-500' },
  REJECTED: { label: 'Abgelehnt', bg: 'bg-red-500/15', text: 'text-red-500', dot: 'bg-red-500' },
};

export function isOutgoing(type: string) {
  return type.startsWith('OUTGOING');
}

export function displayNumber(inv: { invoiceNumberDisplay?: string; invoiceNumber?: number | null; status?: string }) {
  if (inv.invoiceNumberDisplay) return inv.invoiceNumberDisplay;
  if (inv.invoiceNumber != null) return `#${inv.invoiceNumber}`;
  return 'Entwurf';
}

export function formatAmount(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(cents / 100);
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

export const INVOICE_EXTRACTION_FIELDS = [
  { key: 'title', label: 'Titel' },
  { key: 'vendorName', label: 'Lieferant' },
  { key: 'totalCents', label: 'Betrag (Cent)' },
  { key: 'invoiceDate', label: 'Rechnungsdatum' },
  { key: 'dueDate', label: 'Fälligkeitsdatum' },
  { key: 'description', label: 'Beschreibung' },
  { key: 'invoiceNumber', label: 'Externe Rechnungsnr.' },
];
