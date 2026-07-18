import { describe, expect, it } from 'vitest';
import {
  buildDocumentIntakeEntrySearch,
  mapOperatorContextModeToEntry,
  readDocumentIntakeEntry,
  shouldUseOrgUploadForContext,
} from './document-intake-entry';

describe('document-intake-entry', () => {
  it('reads and writes entry URL params', () => {
    const search = buildDocumentIntakeEntrySearch({
      optionalContextType: 'INVOICE',
      sourceSurface: 'invoices_page',
      returnView: 'invoices',
      documentTab: 'upload',
    });
    const entry = readDocumentIntakeEntry(search);
    expect(entry.optionalContextType).toBe('INVOICE');
    expect(entry.sourceSurface).toBe('invoices_page');
    expect(entry.returnView).toBe('invoices');
    expect(search).toContain('documentTab=upload');
  });

  it('maps operator booking context', () => {
    expect(
      mapOperatorContextModeToEntry({
        contextMode: 'booking',
        vehicleId: 'v1',
        bookingId: 'b1',
      }),
    ).toEqual({
      optionalContextType: 'BOOKING',
      optionalContextId: 'b1',
      contextVehicleId: 'v1',
    });
  });

  it('prefers org upload for non-vehicle contexts', () => {
    expect(shouldUseOrgUploadForContext('BOOKING')).toBe(true);
    expect(shouldUseOrgUploadForContext('VEHICLE')).toBe(false);
    expect(shouldUseOrgUploadForContext('NONE')).toBe(false);
  });
});
