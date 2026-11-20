import { DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import { CoreBookingDocumentBundleViewAdapter } from './core-booking-document-bundle-view.adapter';
import type { BookingDocumentBundleService } from '../booking-document-bundle.service';

describe('CoreBookingDocumentBundleViewAdapter', () => {
  const getBundleView = jest.fn();
  const bookingDocumentBundle = { getBundleView } as unknown as BookingDocumentBundleService;
  const adapter = new CoreBookingDocumentBundleViewAdapter(bookingDocumentBundle);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards organizationId and bookingId unchanged', async () => {
    getBundleView.mockResolvedValue({
      bundle: { status: 'READY' },
      missingLegalDocuments: [],
      legal: { missing: [] },
      warnings: [],
    });

    await adapter.getBundleView('org-x', 'bk-y');

    expect(getBundleView).toHaveBeenCalledTimes(1);
    expect(getBundleView).toHaveBeenCalledWith('org-x', 'bk-y');
  });

  it('projects narrow bundle view without extra calls', async () => {
    getBundleView.mockResolvedValue({
      bundle: { status: 'INCOMPLETE', id: 'should-not-leak' },
      missingLegalDocuments: ['ID_FRONT'],
      legal: { missing: [DOCUMENT_TYPE.RENTAL_CONTRACT] },
      warnings: ['legal pointer stale'],
      customer: { name: 'PII' },
    });

    await expect(adapter.getBundleView('org-1', 'bk-1')).resolves.toEqual({
      bundleStatus: 'INCOMPLETE',
      missingLegalDocuments: ['ID_FRONT'],
      legalMissing: [DOCUMENT_TYPE.RENTAL_CONTRACT],
      warnings: ['legal pointer stale'],
    });
    expect(getBundleView).toHaveBeenCalledTimes(1);
  });

  it('preserves empty missing-document lists', async () => {
    getBundleView.mockResolvedValue({
      bundle: { status: 'READY' },
      missingLegalDocuments: [],
      legal: { missing: [] },
      warnings: [],
    });

    await expect(adapter.getBundleView('org-1', 'bk-1')).resolves.toMatchObject({
      missingLegalDocuments: [],
      legalMissing: [],
      warnings: [],
    });
  });
});