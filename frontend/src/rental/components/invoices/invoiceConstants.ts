import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

export const INVOICE_TYPE_MAP: Record<
  string,
  { label: string; icon: typeof ArrowUpRight; color: string }
> = {
  OUTGOING_BOOKING: { label: 'Buchungsrechnung', icon: ArrowUpRight, color: 'text-status-info' },
  OUTGOING_MANUAL: { label: 'Ausgangsrechnung', icon: ArrowUpRight, color: 'text-emerald-500' },
  OUTGOING_FINAL: { label: 'Schlussrechnung', icon: ArrowUpRight, color: 'text-cyan-500' },
  INCOMING_VENDOR: { label: 'Eingangsrechnung', icon: ArrowDownLeft, color: 'text-amber-500' },
  INCOMING_UPLOADED: { label: 'Hochgeladen', icon: ArrowDownLeft, color: 'text-purple-500' },
};

export const INVOICE_TEMPLATES = [
  { id: 'standard', name: 'Standard-Rechnung', description: 'Allgemeine Ausgangsrechnung' },
  { id: 'booking', name: 'Buchungsrechnung', description: 'Für Fahrzeugmietbuchungen' },
  { id: 'damage', name: 'Schadensrechnung', description: 'Für Schadensfälle / Selbstbeteiligung' },
  { id: 'extra', name: 'Zusatzleistungen', description: 'Zusätzliche Services & Gebühren' },
] as const;

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

export const INVOICE_TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'Alle Typen' },
  { value: 'OUTGOING_BOOKING', label: 'Buchungsrechnung' },
  { value: 'OUTGOING_MANUAL', label: 'Ausgangsrechnung' },
  { value: 'OUTGOING_FINAL', label: 'Schlussrechnung' },
  { value: 'INCOMING_VENDOR', label: 'Eingangsrechnung' },
  { value: 'INCOMING_UPLOADED', label: 'Hochgeladen' },
] as const;

export const INVOICE_DOCUMENT_STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Alle Dokumente' },
  { value: 'present', label: 'Dokument vorhanden' },
  { value: 'missing', label: 'Dokument fehlt' },
  { value: 'failed', label: 'Dokument fehlerhaft' },
] as const;

export const INVOICE_SEND_STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Alle Versandstatus' },
  { value: 'QUEUED', label: 'Warteschlange' },
  { value: 'SENDING', label: 'Wird gesendet' },
  { value: 'SENT', label: 'Gesendet' },
  { value: 'FAILED', label: 'Fehlgeschlagen' },
  { value: 'SENT_SIMULATED', label: 'Simuliert' },
] as const;

export const INVOICE_SORT_OPTIONS = [
  { value: 'invoiceDate', label: 'Rechnungsdatum' },
  { value: 'dueDate', label: 'Fälligkeit' },
  { value: 'totalGross', label: 'Betrag' },
  { value: 'status', label: 'Status' },
  { value: 'createdAt', label: 'Erstellt am' },
] as const;

export type InvoiceDirectionFilter = 'all' | 'outgoing' | 'incoming';

export const INVOICE_DIRECTION_OPTIONS: { value: InvoiceDirectionFilter; label: string }[] = [
  { value: 'all', label: 'Alle Richtungen' },
  { value: 'outgoing', label: 'Ausgehend' },
  { value: 'incoming', label: 'Eingehend' },
];

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'BANK_TRANSFER', label: 'Überweisung' },
  { value: 'CASH', label: 'Bar' },
  { value: 'CARD', label: 'Karte' },
  { value: 'STRIPE', label: 'Stripe' },
  { value: 'OTHER', label: 'Sonstige' },
] as const;
