import { describe, expect, it } from 'vitest';
import { buildDocumentArchiveAuditTrail } from './document-archive-audit.util';
import type { PublicDocumentExtractionArchiveItem } from './document-extraction.types';

function baseItem(
  overrides: Partial<PublicDocumentExtractionArchiveItem> = {},
): PublicDocumentExtractionArchiveItem {
  return {
    id: 'ext-1',
    organizationId: 'org-1',
    vehicleId: null,
    vehicle: null,
    sourceFileName: 'invoice.pdf',
    mimeType: 'application/pdf',
    status: 'APPLIED',
    documentCategory: null,
    documentSubtype: null,
    effectiveDocumentType: 'INVOICE',
    acceptedEntityLinks: [],
    actionSummary: {
      status: 'SUCCEEDED',
      lifecycleStatus: 'APPLIED',
      summary: 'Invoice filed',
      succeededCount: 2,
      failedCount: 0,
      pendingCount: 0,
    },
    followUpSummary: {
      status: 'OPEN',
      openCount: 1,
      acceptedCount: 0,
      dismissedCount: 0,
      primaryType: 'CONTACT_PREPARE',
      primaryTitle: 'Contact customer',
    },
    uploader: { id: 'u1', displayName: 'Alex' },
    invoiceNumber: 'INV-1',
    caseReference: null,
    documentDate: null,
    uploadedAt: '2026-07-17T10:00:00.000Z',
    appliedAt: '2026-07-17T10:05:00.000Z',
    updatedAt: '2026-07-17T10:06:00.000Z',
    canDownload: true,
    ...overrides,
  };
}

describe('buildDocumentArchiveAuditTrail', () => {
  it('orders lifecycle events chronologically', () => {
    const trail = buildDocumentArchiveAuditTrail(baseItem());
    expect(trail.map((entry) => entry.key)).toEqual([
      'uploaded',
      'applied',
      'actions',
      'updated',
      'followUp',
    ]);
    expect(trail[0]?.detail).toBe('Alex');
    expect(trail.find((entry) => entry.key === 'actions')?.detail).toContain('Invoice filed');
  });

  it('omits optional events when data is absent', () => {
    const trail = buildDocumentArchiveAuditTrail(
      baseItem({
        appliedAt: null,
        updatedAt: '2026-07-17T10:00:00.000Z',
        actionSummary: {
          status: 'NONE',
          lifecycleStatus: null,
          summary: null,
          succeededCount: 0,
          failedCount: 0,
          pendingCount: 0,
        },
        followUpSummary: {
          status: 'OPEN',
          openCount: 0,
          acceptedCount: 0,
          dismissedCount: 0,
          primaryType: null,
          primaryTitle: null,
        },
      }),
    );
    expect(trail.map((entry) => entry.key)).toEqual(['uploaded']);
  });
});
