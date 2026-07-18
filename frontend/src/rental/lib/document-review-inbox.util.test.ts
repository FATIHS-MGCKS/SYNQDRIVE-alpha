import { describe, expect, it } from 'vitest';
import {
  deriveReviewReasonsFromArchiveItem,
  isReviewInboxArchiveItem,
  matchesReviewReasonFilter,
} from './document-review-inbox.util';
import type { PublicDocumentExtractionArchiveItem } from './document-extraction.types';

function makeArchiveItem(
  overrides: Partial<PublicDocumentExtractionArchiveItem> = {},
): PublicDocumentExtractionArchiveItem {
  return {
    id: 'ext-1',
    organizationId: 'org-1',
    vehicleId: null,
    vehicle: null,
    sourceFileName: 'invoice.pdf',
    mimeType: 'application/pdf',
    status: 'READY_FOR_REVIEW',
    documentCategory: 'FINANCE',
    documentSubtype: 'INVOICE',
    effectiveDocumentType: 'INVOICE',
    acceptedEntityLinks: [],
    actionSummary: {
      status: 'READY',
      lifecycleStatus: null,
      summary: null,
      succeededCount: 0,
      failedCount: 0,
      pendingCount: 0,
    },
    followUpSummary: {
      status: 'NONE',
      openCount: 0,
      acceptedCount: 0,
      dismissedCount: 0,
      primaryType: null,
      primaryTitle: null,
    },
    uploader: null,
    invoiceNumber: null,
    caseReference: null,
    documentDate: null,
    uploadedAt: '2026-07-17T10:00:00.000Z',
    appliedAt: null,
    updatedAt: '2026-07-17T10:00:00.000Z',
    canDownload: true,
    ...overrides,
  };
}

describe('document-review-inbox.util', () => {
  it('detects review inbox candidates and reasons', () => {
    const item = makeArchiveItem({ status: 'AWAITING_DOCUMENT_TYPE' });
    expect(isReviewInboxArchiveItem(item)).toBe(true);
    expect(deriveReviewReasonsFromArchiveItem(item)).toContain('unclear_type');
    expect(matchesReviewReasonFilter(['unclear_type'], 'unclear_type')).toBe(true);
    expect(matchesReviewReasonFilter(['unclear_type'], 'apply_failed')).toBe(false);
  });

  it('flags follow-up and apply failures', () => {
    const item = makeArchiveItem({
      status: 'PARTIALLY_APPLIED',
      actionSummary: {
        status: 'PARTIAL',
        lifecycleStatus: 'PARTIALLY_APPLIED',
        summary: 'Teilweise übernommen',
        succeededCount: 1,
        failedCount: 1,
        pendingCount: 0,
      },
      followUpSummary: {
        status: 'OPEN',
        openCount: 1,
        acceptedCount: 0,
        dismissedCount: 0,
        primaryType: 'PAYMENT_REVIEW',
        primaryTitle: 'Zahlung prüfen',
      },
    });
    const reasons = deriveReviewReasonsFromArchiveItem(item);
    expect(reasons).toContain('apply_failed');
    expect(reasons).toContain('follow_up_open');
  });
});
