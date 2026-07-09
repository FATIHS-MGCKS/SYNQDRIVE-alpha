import type { GeneratedDocumentDto } from '../../../lib/api';
import type {
  DocumentSendAvailability,
  SendDocumentRowModel,
  SendDocumentsEmailBooking,
  SendDocumentsEmailCustomer,
  SendDocumentsSourceContext,
} from './send-documents-email.types';

export const BOOKING_PACKAGE_TYPES = [
  'BOOKING_INVOICE',
  'DEPOSIT_RECEIPT',
  'RENTAL_CONTRACT',
  'TERMS_AND_CONDITIONS',
  'WITHDRAWAL_INFORMATION',
] as const;

export const PICKUP_SEND_TYPES = ['HANDOVER_PICKUP'] as const;
export const RETURN_SEND_TYPES = ['HANDOVER_RETURN', 'FINAL_INVOICE'] as const;

export const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  BOOKING_INVOICE: 'Rechnung',
  DEPOSIT_RECEIPT: 'Kautionsbeleg',
  RENTAL_CONTRACT: 'Mietvertrag',
  TERMS_AND_CONDITIONS: 'AGB',
  WITHDRAWAL_INFORMATION: 'Widerrufsbelehrung',
  HANDOVER_PICKUP: 'Übergabeprotokoll (Abholung)',
  HANDOVER_RETURN: 'Übergabeprotokoll (Rückgabe)',
  FINAL_INVOICE: 'Schlussrechnung',
};

export function customerEmail(customer?: SendDocumentsEmailCustomer | null): string {
  return customer?.email?.trim() ?? '';
}

export function hasCustomerEmail(customer?: SendDocumentsEmailCustomer | null): boolean {
  const email = customerEmail(customer);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function customerDisplayName(customer?: SendDocumentsEmailCustomer | null): string {
  if (customer?.fullName?.trim()) return customer.fullName.trim();
  const composed = [customer?.firstName, customer?.lastName].filter(Boolean).join(' ').trim();
  return composed || 'Kunde';
}

export function bookingNumberLabel(
  booking?: SendDocumentsEmailBooking | null,
  bookingId?: string,
): string {
  if (booking?.bookingNumber?.trim()) return booking.bookingNumber.trim();
  const id = booking?.id ?? bookingId;
  if (!id) return 'Buchung';
  return `BK-${id.slice(-6).toUpperCase()}`;
}

export function resolveDocumentAvailability(
  doc: GeneratedDocumentDto | null | undefined,
): DocumentSendAvailability {
  if (!doc) return 'missing';
  if (doc.status === 'VOID') return 'void';
  if (doc.status === 'FAILED' || doc.regenerateRecommended) return 'regenerate_recommended';
  if (doc.status === 'SENT' || doc.lastSentAt || doc.sentAt) return 'sent';
  return 'available';
}

export function isDocumentSelectable(doc: GeneratedDocumentDto | null | undefined): boolean {
  if (!doc?.id) return false;
  if (doc.status === 'VOID' || doc.status === 'FAILED') return false;
  return true;
}

export function buildDocumentRows(
  documentTypes: string[],
  currentByType: Record<string, GeneratedDocumentDto>,
): SendDocumentRowModel[] {
  return documentTypes.map((documentType) => {
    const doc = currentByType[documentType] ?? null;
    const availability = resolveDocumentAvailability(doc);
    return {
      documentType,
      label: DOCUMENT_TYPE_LABEL[documentType] ?? documentType,
      doc,
      availability,
      selectable: isDocumentSelectable(doc),
    };
  });
}

export function currentDocumentsByType(
  documents: GeneratedDocumentDto[],
): Record<string, GeneratedDocumentDto> {
  const map: Record<string, GeneratedDocumentDto> = {};
  const sorted = [...documents].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const doc of sorted) {
    if (doc.status === 'VOID') continue;
    map[doc.documentType] = doc;
  }
  return map;
}

export function selectableIdsFromTypes(
  types: readonly string[],
  currentByType: Record<string, GeneratedDocumentDto>,
): string[] {
  return types
    .map((type) => currentByType[type])
    .filter((doc): doc is GeneratedDocumentDto => isDocumentSelectable(doc))
    .map((doc) => doc.id);
}

export function countSelectableDocuments(documents: GeneratedDocumentDto[]): number {
  return documents.filter((doc) => isDocumentSelectable(doc)).length;
}

export function bookingRowCanSendDocuments(
  customerEmailValue: string | null | undefined,
  sendableDocumentCount: number | null | undefined,
): boolean {
  return hasCustomerEmail({ email: customerEmailValue }) && (sendableDocumentCount ?? 0) > 0;
}

export function buildInvoicePaymentMessageSuffix(
  outstandingCents: number,
  currency: string,
): string {
  if (outstandingCents <= 0) return '';
  const amount = (outstandingCents / 100).toLocaleString('de-DE', {
    style: 'currency',
    currency: currency || 'EUR',
  });
  return `\n\nOffener Betrag: ${amount}. Bitte überweisen Sie den ausstehenden Betrag unter Angabe der Rechnungsnummer.`;
}

export function isDocumentEmailTimelineEvent(event: {
  type?: unknown;
  title?: unknown;
  metadata?: unknown;
}): boolean {
  const type = String(event.type ?? '').toUpperCase();
  if (type !== 'NOTE_ADDED' && type !== 'NOTE_CREATED') return false;
  const title = String(event.title ?? '').toLowerCase();
  if (title.includes('dokument') && title.includes('e-mail')) return true;
  const metadata = event.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const meta = metadata as Record<string, unknown>;
  return Boolean(meta.bookingId && Array.isArray(meta.documentIds) && meta.documentIds.length > 0);
}

export function documentEmailTimelineMeta(event: {
  metadata?: unknown;
}): {
  bookingId?: string;
  documentIds: string[];
  to?: string;
  outboundEmailId?: string;
} | null {
  const metadata = event.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const meta = metadata as Record<string, unknown>;
  const bookingId = typeof meta.bookingId === 'string' ? meta.bookingId : undefined;
  const documentIds = Array.isArray(meta.documentIds)
    ? meta.documentIds.filter((id): id is string => typeof id === 'string')
    : [];
  if (!bookingId || documentIds.length === 0) return null;
  return {
    bookingId,
    documentIds,
    to: typeof meta.to === 'string' ? meta.to : undefined,
    outboundEmailId: typeof meta.outboundEmailId === 'string' ? meta.outboundEmailId : undefined,
  };
}

export function parseCcInput(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function buildDefaultSubject(
  bookingLabel: string,
  documentTypes: string[],
  sourceContext: SendDocumentsSourceContext,
): string {
  const unique = [...new Set(documentTypes)];
  if (sourceContext === 'HANDOVER_PICKUP' || unique.includes('HANDOVER_PICKUP')) {
    return `Ihr Übergabeprotokoll zur Abholung (${bookingLabel})`;
  }
  if (sourceContext === 'HANDOVER_RETURN') {
    return `Ihre Rückgabeunterlagen (${bookingLabel})`;
  }
  if (sourceContext === 'INVOICE') {
    return `Ihre Rechnung zur Buchung ${bookingLabel}`;
  }
  if (unique.length === 1) {
    switch (unique[0]) {
      case 'BOOKING_INVOICE':
      case 'FINAL_INVOICE':
        return `Ihre Rechnung zur Buchung ${bookingLabel}`;
      case 'HANDOVER_RETURN':
        return `Ihr Rückgabeprotokoll (${bookingLabel})`;
      default:
        break;
    }
  }
  return `Ihre Mietunterlagen zur Buchung ${bookingLabel}`;
}

export function buildDefaultMessage(
  customerName: string,
  bookingLabel: string,
  documentTypes: string[],
): string {
  const lines = [
    `Guten Tag ${customerName},`,
    '',
    'anbei erhalten Sie die angeforderten Unterlagen zu Ihrer Buchung.',
    '',
    `Buchung: ${bookingLabel}`,
    '',
    'Anhänge:',
    ...documentTypes.map((type) => `• ${DOCUMENT_TYPE_LABEL[type] ?? type}`),
  ];
  return lines.join('\n');
}

export function availabilityLabel(availability: DocumentSendAvailability): string {
  switch (availability) {
    case 'available':
      return 'Verfügbar';
    case 'missing':
      return 'Fehlt';
    case 'void':
      return 'Ungültig';
    case 'failed':
    case 'regenerate_recommended':
      return 'Neu generieren empfohlen';
    case 'sent':
      return 'Bereits gesendet';
    default:
      return availability;
  }
}

export function formatSentHint(doc: GeneratedDocumentDto): string | null {
  if (!doc.lastSentAt && !doc.sentAt) return null;
  const when = new Date(doc.lastSentAt ?? doc.sentAt ?? '');
  if (Number.isNaN(when.getTime())) return null;
  const date = when.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (doc.lastSentTo) return `Zuletzt gesendet an ${doc.lastSentTo} am ${date}`;
  return `Zuletzt gesendet am ${date}`;
}
