import { InvoicePaymentMethod } from '@prisma/client';
import type { InvoiceTimelineEventKind } from './invoice-timeline.types';

const EVENT_LABEL_DE: Record<InvoiceTimelineEventKind, string> = {
  INVOICE_CREATED: 'Rechnung erstellt',
  INVOICE_ISSUED: 'Rechnung ausgestellt',
  INVOICE_NUMBER_ASSIGNED: 'Rechnungsnummer vergeben',
  PDF_GENERATED: 'PDF erzeugt',
  PDF_VERSION_REPLACED: 'PDF-Version ersetzt',
  DELIVERY_PREPARED: 'Versand vorbereitet',
  DELIVERY_SENT: 'Über SynqDrive versendet',
  DELIVERY_DELIVERED: 'Zugestellt',
  DELIVERY_FAILED: 'Versand fehlgeschlagen',
  DELIVERY_EXTERNALLY_MARKED: 'Extern versendet',
  PAYMENT_PARTIAL: 'Teilzahlung erfasst',
  PAYMENT_FULL: 'Vollständig bezahlt',
  PAYMENT_REVERSED: 'Zahlung zurückgebucht',
  INVOICE_OVERDUE: 'Rechnung überfällig',
  INVOICE_CANCELLED: 'Rechnung storniert',
  INVOICE_CREDITED: 'Gutschrift erstellt',
  INVOICE_VOIDED: 'Rechnung ungültig',
  PDF_GENERATION_FAILED: 'PDF-Erzeugung fehlgeschlagen',
  DELIVERY_RETRY: 'E-Mail erneut versendet',
  AUDIT: 'Ereignis',
};

export function invoiceTimelineEventLabel(kind: InvoiceTimelineEventKind): string {
  return EVENT_LABEL_DE[kind] ?? 'Ereignis';
}

export function invoicePaymentMethodLabel(method: string): string {
  switch (method as InvoicePaymentMethod) {
    case 'CASH':
      return 'Barzahlung';
    case 'BANK_TRANSFER':
      return 'Banküberweisung';
    case 'CARD':
      return 'Karte';
    case 'STRIPE':
      return 'Stripe';
    case 'OTHER':
      return 'Sonstige';
    default:
      return 'Zahlung';
  }
}

export function actorLabelFromName(
  actorType: 'user' | 'system' | 'automation' | 'unavailable',
  actorName: string | null,
): string {
  if (actorName?.trim()) return actorName.trim();
  switch (actorType) {
    case 'system':
      return 'System';
    case 'automation':
      return 'Automation';
    case 'unavailable':
      return 'Nicht verfügbar';
    default:
      return 'Nicht verfügbar';
  }
}

export function formatMoneyCents(cents: number, currency: string): string {
  const cur = (currency || 'EUR').toUpperCase();
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: cur }).format(cents / 100);
}
