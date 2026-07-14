import type { InvoiceDetail } from './invoiceTypes';

type DocumentRow = { id?: string; filename?: string; documentType?: string };

/** Human label for linked generated document — never a raw UUID fragment. */
export function resolveLinkedDocumentLabel(
  invoice: Pick<
    InvoiceDetail,
    'documents' | 'activeDocumentId' | 'generatedDocumentId' | 'booking' | 'invoiceNumberDisplay'
  >,
): string | null {
  const docs = (invoice.documents ?? []) as DocumentRow[];
  const activeId = invoice.activeDocumentId ?? invoice.generatedDocumentId ?? null;
  if (!activeId && docs.length === 0) return null;

  const active = activeId ? docs.find((d) => d.id === activeId) : docs[0];
  if (active?.filename && !looksLikeUuidFragment(active.filename)) {
    return active.filename;
  }
  if (invoice.invoiceNumberDisplay && invoice.invoiceNumberDisplay !== 'Entwurf') {
    return `Rechnung ${invoice.invoiceNumberDisplay}`;
  }
  if (invoice.booking?.bookingNumber) {
    return `Buchung ${invoice.booking.bookingNumber}`;
  }
  return 'Generiertes Dokument verknüpft';
}

function looksLikeUuidFragment(value: string): boolean {
  return /[0-9a-f]{8}-[0-9a-f]{4}/i.test(value) || /^[0-9a-f]{8}(\.|…|$)/i.test(value);
}
