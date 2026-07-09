import { describe, expect, it } from 'vitest';
import type { GeneratedDocumentDto } from '../../lib/api';
import {
  BOOKING_PACKAGE_TYPES,
  buildDefaultSubject,
  currentDocumentsByType,
  hasCustomerEmail,
  isDocumentSelectable,
  parseCcInput,
  selectableIdsFromTypes,
} from './send-documents-email.utils';

function doc(partial: Partial<GeneratedDocumentDto> & Pick<GeneratedDocumentDto, 'id' | 'documentType'>): GeneratedDocumentDto {
  return {
    id: partial.id,
    documentType: partial.documentType,
    origin: partial.origin ?? 'GENERATED',
    status: partial.status ?? 'GENERATED',
    title: partial.title ?? partial.documentType,
    documentNumber: partial.documentNumber ?? null,
    fileName: partial.fileName ?? `${partial.documentType}.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: 100,
    bookingId: 'bk-1',
    invoiceId: null,
    legalVersionLabel: null,
    generatedAt: '2026-07-01T10:00:00.000Z',
    sentAt: partial.sentAt ?? null,
    createdAt: '2026-07-01T10:00:00.000Z',
    ...partial,
  };
}

describe('send-documents-email.utils', () => {
  it('selects booking package document ids for available docs only', () => {
    const documents = [
      doc({ id: 'd1', documentType: 'BOOKING_INVOICE' }),
      doc({ id: 'd2', documentType: 'RENTAL_CONTRACT' }),
      doc({ id: 'd3', documentType: 'TERMS_AND_CONDITIONS', status: 'VOID' }),
    ];
    const byType = currentDocumentsByType(documents);
    const ids = selectableIdsFromTypes(BOOKING_PACKAGE_TYPES, byType);
    expect(ids).toEqual(['d1', 'd2']);
  });

  it('treats VOID and FAILED documents as not selectable', () => {
    expect(isDocumentSelectable(doc({ id: 'v', documentType: 'BOOKING_INVOICE', status: 'VOID' }))).toBe(false);
    expect(isDocumentSelectable(doc({ id: 'f', documentType: 'BOOKING_INVOICE', status: 'FAILED' }))).toBe(false);
    expect(isDocumentSelectable(null)).toBe(false);
    expect(isDocumentSelectable(doc({ id: 'ok', documentType: 'BOOKING_INVOICE' }))).toBe(true);
  });

  it('blocks send when customer email is missing or invalid', () => {
    expect(hasCustomerEmail(null)).toBe(false);
    expect(hasCustomerEmail({ email: '' })).toBe(false);
    expect(hasCustomerEmail({ email: 'not-an-email' })).toBe(false);
    expect(hasCustomerEmail({ email: 'kunde@firma.de' })).toBe(true);
  });

  it('builds contextual default subjects', () => {
    expect(buildDefaultSubject('BK-123456', ['HANDOVER_PICKUP'], 'HANDOVER_PICKUP')).toContain('Abholung');
    expect(buildDefaultSubject('BK-123456', ['FINAL_INVOICE'], 'INVOICE')).toContain('Rechnung');
    expect(buildDefaultSubject('BK-123456', BOOKING_PACKAGE_TYPES as unknown as string[], 'BOOKING_DOCUMENTS')).toContain(
      'Mietunterlagen',
    );
  });

  it('parses cc input into distinct addresses', () => {
    expect(parseCcInput('a@b.de, c@d.de; e@f.de')).toEqual(['a@b.de', 'c@d.de', 'e@f.de']);
  });
});
