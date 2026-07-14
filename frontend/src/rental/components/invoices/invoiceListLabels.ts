import type { StatusTone } from '../../../components/patterns';
import type { InvoiceListItem } from './invoiceTypes';

export function counterpartyDisplayName(item: InvoiceListItem): string {
  if (item.direction === 'incoming') {
    return item.supplierDisplayName?.trim() || item.customerDisplayName?.trim() || '—';
  }
  return item.customerDisplayName?.trim() || item.supplierDisplayName?.trim() || '—';
}

export function vehicleDisplayLine(item: InvoiceListItem): string {
  const plate = item.licensePlate?.trim();
  const name = item.vehicleDisplayName?.trim();
  if (name && plate) return `${name} · ${plate}`;
  return name || plate || '—';
}

const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Entwurf',
  GENERATED: 'Erstellt',
  SENT: 'Versendet',
  VOID: 'Ungültig',
  FAILED: 'Fehler',
  UNKNOWN: 'Unbekannt',
};

const SEND_STATUS_LABELS: Record<string, string> = {
  QUEUED: 'Warteschlange',
  SENDING: 'Wird gesendet',
  SENT: 'Gesendet',
  FAILED: 'Fehlgeschlagen',
  SENT_SIMULATED: 'Simuliert',
  DELIVERED: 'Zugestellt',
  BOUNCED: 'Zurückgewiesen',
};

export function documentStatusLabelDe(status: string | null | undefined): string {
  if (!status) return 'Kein Dokument';
  return DOCUMENT_STATUS_LABELS[status] ?? status;
}

export function sendStatusLabelDe(status: string | null | undefined): string {
  if (!status) return 'Nicht versendet';
  return SEND_STATUS_LABELS[status] ?? status;
}

export function documentStatusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'noData';
  if (status === 'FAILED') return 'critical';
  if (status === 'GENERATED' || status === 'SENT') return 'success';
  if (status === 'DRAFT') return 'neutral';
  if (status === 'VOID') return 'muted';
  return 'info';
}

export function sendStatusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'noData';
  if (status === 'FAILED' || status === 'BOUNCED') return 'critical';
  if (status === 'SENT' || status === 'DELIVERED' || status === 'SENT_SIMULATED') return 'success';
  if (status === 'SENDING' || status === 'QUEUED') return 'warning';
  return 'neutral';
}
