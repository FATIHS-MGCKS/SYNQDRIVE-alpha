import { buildContactDraft, buildDocumentReference } from './document-follow-up-contact.draft';
import { DOCUMENT_FOLLOW_UP_CONTACT_TARGETS } from './document-follow-up-contact.types';

describe('document-follow-up-contact.draft', () => {
  it('builds document reference without sensitive raw fields', () => {
    const reference = buildDocumentReference({
      extractionId: 'ext-1',
      fileName: 'fine.pdf',
      documentType: 'FINE',
      documentSubtype: null,
      confirmedData: {
        reportNumber: 'BV-123',
        iban: 'DE89370400440532013000',
        rawText: 'secret ocr blob',
      },
    });

    expect(reference.displayLabel).toContain('fine.pdf');
    expect(reference.referenceHint).toBe('BV-123');
    expect(reference.displayLabel).not.toContain('DE89');
  });

  it('builds German contact draft with document reference only', () => {
    const reference = buildDocumentReference({
      extractionId: 'ext-1',
      fileName: 'invoice.pdf',
      documentType: 'INVOICE',
      documentSubtype: null,
      confirmedData: { invoiceNumber: 'R-2026-01' },
    });
    const draft = buildContactDraft({
      contactTarget: DOCUMENT_FOLLOW_UP_CONTACT_TARGETS.VENDOR,
      recipientDisplayName: 'Werkstatt Müller',
      documentReference: reference,
      suggestionTitle: 'Rechnung freigeben',
      suggestionRationale: 'Zahlung prüfen',
    });

    expect(draft.subject).toContain('Lieferant');
    expect(draft.bodyText).toContain('ext-1');
    expect(draft.bodyText).not.toContain('secret');
    expect(draft.bodyHtml).toContain('<p>');
  });
});
