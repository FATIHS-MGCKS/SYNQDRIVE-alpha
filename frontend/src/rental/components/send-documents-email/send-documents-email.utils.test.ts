import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GeneratedDocumentDto } from '../../lib/api';
import {
  BOOKING_PACKAGE_TYPES,
  bookingRowCanSendDocuments,
  buildDefaultSubject,
  buildInvoicePaymentMessageSuffix,
  currentDocumentsByType,
  hasCustomerEmail,
  isDocumentEmailTimelineEvent,
  isDocumentSelectable,
  parseCcInput,
  selectableIdsFromTypes,
} from './send-documents-email.utils';
import { canSendDocumentsEmail } from './send-documents-email.permissions';

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

  it('gates booking list send affordance on email and sendable docs', () => {
    expect(bookingRowCanSendDocuments('kunde@firma.de', 2)).toBe(true);
    expect(bookingRowCanSendDocuments('kunde@firma.de', 0)).toBe(false);
    expect(bookingRowCanSendDocuments(null, 3)).toBe(false);
  });

  it('detects document email timeline events', () => {
    expect(
      isDocumentEmailTimelineEvent({
        type: 'NOTE_ADDED',
        title: 'Dokumente per E-Mail gesendet (BK-123456)',
        metadata: { bookingId: 'bk-1', documentIds: ['d1'] },
      }),
    ).toBe(true);
    expect(
      isDocumentEmailTimelineEvent({
        type: 'NOTE_ADDED',
        title: 'Allgemeine Notiz',
      }),
    ).toBe(false);
  });

  it('adds payment hint suffix for open invoices', () => {
    expect(buildInvoicePaymentMessageSuffix(12500, 'EUR')).toContain('125');
  });

  it('exposes consistent send permissions', () => {
    expect(canSendDocumentsEmail('ORG_ADMIN')).toBe(true);
    expect(canSendDocumentsEmail('VIEWER')).toBe(false);
  });

  it('LegalDocumentsTab has no customer send integration', () => {
    const source = readFileSync(
      resolve(__dirname, '../LegalDocumentsTab.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/SendDocumentsEmailModal/);
    expect(source).not.toMatch(/sendBookingDocumentsEmail/);
    expect(source).not.toMatch(/Unterlagen senden|Rechnung senden|Protokoll senden/);
  });

  it('InvoicesView send action uses generated document id', () => {
    const source = readFileSync(resolve(__dirname, '../InvoicesView.tsx'), 'utf8');
    expect(source).toContain('generatedDocumentId');
    expect(source).toContain('SendDocumentsEmailLauncherProvider');
    expect(source).toContain('Rechnung senden');
  });
});
