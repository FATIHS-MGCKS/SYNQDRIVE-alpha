import { DOCUMENT_TITLE_DE, DOCUMENT_TYPE } from './documents.constants';

export interface BookingEmailContext {
  bookingNumber: string;
  customerName: string;
  vehicleLabel: string;
  periodLabel: string;
  organizationName: string;
}

export function formatBookingNumber(bookingId: string): string {
  return `BK-${bookingId.slice(-6).toUpperCase()}`;
}

export function formatBookingPeriod(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

export function buildDefaultSubject(bookingNumber: string, documentTypes: string[]): string {
  const unique = [...new Set(documentTypes)];
  if (unique.length === 1) {
    switch (unique[0]) {
      case DOCUMENT_TYPE.BOOKING_INVOICE:
      case DOCUMENT_TYPE.FINAL_INVOICE:
        return `Ihre Rechnung zur Buchung ${bookingNumber}`;
      case DOCUMENT_TYPE.HANDOVER_PICKUP:
        return `Ihr Übergabeprotokoll zur Abholung (${bookingNumber})`;
      case DOCUMENT_TYPE.HANDOVER_RETURN:
        return `Ihr Rückgabeprotokoll (${bookingNumber})`;
      default:
        break;
    }
  }
  return `Ihre Mietunterlagen zur Buchung ${bookingNumber}`;
}

export function buildDefaultBodyText(
  context: BookingEmailContext,
  documentTypes: string[],
  customMessage?: string,
): string {
  const lines = [
    `Guten Tag ${context.customerName},`,
    '',
    customMessage?.trim() ||
      'anbei erhalten Sie die angeforderten Unterlagen zu Ihrer Buchung.',
    '',
    `Buchung: ${context.bookingNumber}`,
    `Fahrzeug: ${context.vehicleLabel}`,
    `Zeitraum: ${context.periodLabel}`,
    '',
    'Anhänge:',
    ...documentTypes.map((type) => `• ${DOCUMENT_TITLE_DE[type] ?? type}`),
    '',
    `Mit freundlichen Grüßen`,
    context.organizationName,
  ];
  return lines.join('\n');
}

export function appendSignature(
  bodyText: string,
  signatureText?: string | null,
  signatureHtml?: string | null,
): { bodyText: string; bodyHtml?: string } {
  if (!signatureText?.trim() && !signatureHtml?.trim()) {
    return { bodyText };
  }
  const text = signatureText?.trim();
  const html = signatureHtml?.trim();
  const outText = text ? `${bodyText}\n\n${text}` : bodyText;
  const outHtml = html
    ? `${bodyText.replace(/\n/g, '<br>')}<br><br>${html}`
    : outText.replace(/\n/g, '<br>');
  return { bodyText: outText, bodyHtml: outHtml };
}
