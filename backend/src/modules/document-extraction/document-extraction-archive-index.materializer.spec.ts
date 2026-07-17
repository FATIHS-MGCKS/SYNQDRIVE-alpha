import {
  buildArchiveSearchText,
  buildDocumentExtractionArchiveIndexRow,
  resolveArchiveActionStatus,
  resolveArchiveFollowUpStatus,
} from './document-extraction-archive-index.materializer';
import { DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES } from './document-follow-up-suggestion.types';

describe('document-extraction-archive-index.materializer', () => {
  it('excludes raw OCR and sensitive fields from search text', () => {
    const searchText = buildArchiveSearchText({
      sourceFileName: 'invoice.pdf',
      documentCategory: 'FINANCE',
      documentSubtype: 'INVOICE',
      fields: {
        invoiceNumber: 'RE-2026-001',
        rawText: 'full ocr dump must not appear',
        ocrText: 'ocr dump',
        iban: 'DE89370400440532013000',
        notes: 'Werkstatt Hamburg',
      },
      entityLinks: {
        vehicleId: 'veh-1',
        bookingId: null,
        customerId: null,
        driverId: null,
        vendorId: null,
      },
    });

    expect(searchText).toContain('invoice.pdf');
    expect(searchText).toContain('re-2026-001');
    expect(searchText).toContain('werkstatt hamburg');
    expect(searchText).not.toContain('full ocr');
    expect(searchText).not.toContain('ocr dump');
    expect(searchText).not.toContain('de8937');
  });

  it('materializes denormalized archive row with entity links and references', () => {
    const row = buildDocumentExtractionArchiveIndexRow({
      id: 'ext-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      status: 'READY_FOR_REVIEW',
      effectiveDocumentType: 'INVOICE',
      sourceFileName: 'invoice.pdf',
      createdAt: new Date('2026-07-17T10:00:00.000Z'),
      confirmedData: {
        invoiceNumber: 'INV-77',
        reportNumber: 'AZ-123',
        acceptedEntityLinks: [
          { entityType: 'booking', entityId: 'book-1', label: 'Booking' },
          { entityType: 'vendor', entityId: 'vendor-1', label: 'Vendor' },
        ],
      },
      plausibility: {
        _pipeline: {
          followUpSuggestions: [
            {
              suggestionId: 'sug-1',
              extractionId: 'ext-1',
              actionPlanId: 'plan-1',
              type: 'PAYMENT_REVIEW',
              status: DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.SUGGESTED,
              title: 'Zahlung prüfen',
            },
          ],
        },
      },
    });

    expect(row).toMatchObject({
      extractionId: 'ext-1',
      organizationId: 'org-1',
      invoiceNumber: 'INV-77',
      caseReference: 'AZ-123',
      bookingId: 'book-1',
      vendorId: 'vendor-1',
      followUpStatus: 'OPEN',
    });
    expect(row?.searchText).toContain('inv-77');
  });

  it('resolves action and follow-up archive statuses', () => {
    expect(
      resolveArchiveActionStatus({
        status: 'APPLIED',
        plausibility: { _pipeline: { actionPlanApplyLifecycle: { status: 'APPLIED' } } },
      }),
    ).toBe('SUCCEEDED');

    expect(
      resolveArchiveFollowUpStatus({
        _pipeline: {
          followUpSuggestions: [
            {
              suggestionId: 'sug-1',
              extractionId: 'ext-1',
              actionPlanId: 'plan-1',
              type: 'PAYMENT_REVIEW',
              status: DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.ACCEPTED,
              title: 'Zahlung prüfen',
            },
            {
              suggestionId: 'sug-2',
              extractionId: 'ext-1',
              actionPlanId: 'plan-1',
              type: 'NO_FOLLOW_UP',
              status: DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.SUGGESTED,
              title: 'Keine Folgeaktion',
            },
          ],
        },
      }),
    ).toBe('ACCEPTED');
  });

  it('returns null when organization scope is missing', () => {
    expect(
      buildDocumentExtractionArchiveIndexRow({
        id: 'ext-1',
        organizationId: null,
        vehicleId: null,
        status: 'QUEUED',
        createdAt: new Date(),
      }),
    ).toBeNull();
  });
});
