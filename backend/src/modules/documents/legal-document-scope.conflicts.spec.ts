import {
  bookingChannelsOverlap,
  customerSegmentsOverlap,
  detectScopeConflicts,
  findConflictsForCandidate,
  productScopesOverlap,
  scopesOverlap,
  stationScopesOverlap,
  validityRangesOverlap,
  type LegalDocumentScopeShape,
} from './legal-document-scope.conflicts';

function baseScope(overrides: Partial<LegalDocumentScopeShape> = {}): LegalDocumentScopeShape {
  return {
    id: 'doc-1',
    documentType: 'TERMS_AND_CONDITIONS',
    language: 'de',
    jurisdictionCountry: 'DE',
    customerSegment: 'BOTH',
    bookingChannel: 'ALL',
    productScope: null,
    stationScopeMode: 'ORGANIZATION_WIDE',
    stationIds: [],
    priority: 0,
    noticePurpose: 'TERMS_AND_CONDITIONS',
    validFrom: null,
    validUntil: null,
    ...overrides,
  };
}

describe('legal-document-scope.conflicts', () => {
  describe('validityRangesOverlap', () => {
    it('detects overlapping validity windows', () => {
      expect(
        validityRangesOverlap(
          { validFrom: new Date('2026-01-01'), validUntil: new Date('2026-06-01') },
          { validFrom: new Date('2026-03-01'), validUntil: new Date('2026-12-01') },
        ),
      ).toBe(true);
    });

    it('treats non-overlapping ranges as disjoint', () => {
      expect(
        validityRangesOverlap(
          { validFrom: new Date('2026-01-01'), validUntil: new Date('2026-03-01') },
          { validFrom: new Date('2026-06-01'), validUntil: new Date('2026-12-01') },
        ),
      ).toBe(false);
    });
  });

  describe('customerSegmentsOverlap', () => {
    it('separates B2B from B2C when neither is BOTH', () => {
      expect(customerSegmentsOverlap('B2B', 'B2C')).toBe(false);
      expect(customerSegmentsOverlap('B2B', 'BOTH')).toBe(true);
    });
  });

  describe('bookingChannelsOverlap', () => {
    it('treats ALL as overlapping with specific channels', () => {
      expect(bookingChannelsOverlap('WEBSITE', 'ALL')).toBe(true);
      expect(bookingChannelsOverlap('WEBSITE', 'API')).toBe(false);
    });
  });

  describe('productScopesOverlap', () => {
    it('treats null product scope as all products', () => {
      expect(productScopesOverlap(null, 'RENTAL')).toBe(true);
      expect(productScopesOverlap('RENTAL', 'FLEET')).toBe(false);
    });
  });

  describe('stationScopesOverlap', () => {
    it('treats organization-wide as overlapping any station scope', () => {
      expect(
        stationScopesOverlap(
          { stationScopeMode: 'ORGANIZATION_WIDE', stationIds: [] },
          { stationScopeMode: 'STATION_SPECIFIC', stationIds: ['st-1'] },
        ),
      ).toBe(true);
    });

    it('detects intersection of station-specific sets', () => {
      expect(
        stationScopesOverlap(
          { stationScopeMode: 'STATION_SPECIFIC', stationIds: ['st-1', 'st-2'] },
          { stationScopeMode: 'STATION_SPECIFIC', stationIds: ['st-2', 'st-3'] },
        ),
      ).toBe(true);
      expect(
        stationScopesOverlap(
          { stationScopeMode: 'STATION_SPECIFIC', stationIds: ['st-1'] },
          { stationScopeMode: 'STATION_SPECIFIC', stationIds: ['st-9'] },
        ),
      ).toBe(false);
    });
  });

  describe('detectScopeConflicts', () => {
    it('flags overlapping scopes with identical priority as conflicts', () => {
      const a = baseScope({ id: 'a', customerSegment: 'B2C', bookingChannel: 'WEBSITE' });
      const b = baseScope({
        id: 'b',
        customerSegment: 'BOTH',
        bookingChannel: 'ALL',
        priority: 0,
      });
      expect(scopesOverlap(a, b)).not.toBeNull();
      const conflicts = detectScopeConflicts([a, b]);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.reason).toBe('OVERLAPPING_SCOPE_SAME_PRIORITY');
    });

    it('allows overlapping scopes when priorities differ and segments do not overlap', () => {
      const a = baseScope({ id: 'a', priority: 10, customerSegment: 'B2C' });
      const b = baseScope({ id: 'b', priority: 5, customerSegment: 'B2B' });
      expect(detectScopeConflicts([a, b])).toHaveLength(0);
    });

    it('flags identical scope fingerprints', () => {
      const a = baseScope({ id: 'a' });
      const b = baseScope({ id: 'b' });
      const conflicts = detectScopeConflicts([a, b]);
      expect(conflicts[0]?.reason).toBe('IDENTICAL_SCOPE_FINGERPRINT');
    });
  });

  describe('findConflictsForCandidate', () => {
    it('detects conflicts for a candidate against legacy defaults', () => {
      const legacy = baseScope({ id: 'legacy' });
      const candidate = baseScope({
        id: undefined,
        customerSegment: 'B2C',
        bookingChannel: 'MANUAL',
      });
      const conflicts = findConflictsForCandidate(candidate, [legacy]);
      expect(conflicts.length).toBeGreaterThan(0);
    });
  });
});
