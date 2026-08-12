import {
  buildUnknownFreshness,
  provenanceState,
  completenessState,
  freshnessDimensionState,
  validityState,
  weakestDimension,
  rollupQualityStatus,
} from './evaluations-quality.domain';

describe('E5.1A freshness truth (no pipeline authority → UNKNOWN)', () => {
  it('freshness is UNKNOWN with no ingestion/observation/sync timestamp', () => {
    const fresh = buildUnknownFreshness(new Date('2026-02-15T00:00:00.000Z'));
    expect(fresh.state).toBe('UNKNOWN');
    expect(fresh.newestSourceAt).toBeNull();
    expect(fresh.oldestSourceAt).toBeNull();
    expect(fresh.lastSuccessfulImportAt).toBeNull();
    expect(fresh.evaluatedAt).toBe('2026-02-15T00:00:00.000Z');
  });

  it('freshness dimension for UNKNOWN state is UNKNOWN (never COMPLETE)', () => {
    expect(freshnessDimensionState('UNKNOWN')).toBe('UNKNOWN');
    expect(freshnessDimensionState(null)).toBe('UNKNOWN');
  });
});

describe('E5.1A composite provenance', () => {
  it('is COMPLETE only when every required source class is present', () => {
    expect(
      provenanceState({ served: true, requiredClasses: ['FINANCE_INVOICE', 'FINANCE_PAYMENT'], presentClasses: ['FINANCE_INVOICE', 'FINANCE_PAYMENT'] }),
    ).toBe('COMPLETE');
  });

  it('is PARTIAL when only one of several required classes is present', () => {
    expect(
      provenanceState({ served: true, requiredClasses: ['FINANCE_INVOICE', 'FINANCE_PAYMENT'], presentClasses: ['FINANCE_INVOICE'] }),
    ).toBe('PARTIAL');
  });

  it('is UNKNOWN when no required class is present, UNAVAILABLE when not served', () => {
    expect(
      provenanceState({ served: true, requiredClasses: ['FINANCE_INVOICE'], presentClasses: [] }),
    ).toBe('UNKNOWN');
    expect(
      provenanceState({ served: false, requiredClasses: ['FINANCE_INVOICE'], presentClasses: [] }),
    ).toBe('UNAVAILABLE');
  });
});

describe('E5.1A conservative status roll-up (never upgrades)', () => {
  it('AVAILABLE + AVAILABLE → AVAILABLE', () => {
    expect(rollupQualityStatus(['AVAILABLE', 'AVAILABLE'])).toBe('AVAILABLE');
  });
  it('AVAILABLE + PARTIAL → PARTIAL (not AVAILABLE)', () => {
    expect(rollupQualityStatus(['AVAILABLE', 'PARTIAL'])).toBe('PARTIAL');
  });
  it('PARTIAL + PARTIAL → PARTIAL (not AVAILABLE)', () => {
    expect(rollupQualityStatus(['PARTIAL', 'PARTIAL'])).toBe('PARTIAL');
  });
  it('AVAILABLE + STALE → not silently AVAILABLE', () => {
    expect(rollupQualityStatus(['AVAILABLE', 'STALE'])).toBe('PARTIAL');
  });
  it('AVAILABLE + UNAVAILABLE → PARTIAL; all UNAVAILABLE → UNAVAILABLE', () => {
    expect(rollupQualityStatus(['AVAILABLE', 'UNAVAILABLE'])).toBe('PARTIAL');
    expect(rollupQualityStatus(['UNAVAILABLE', 'UNAVAILABLE'])).toBe('UNAVAILABLE');
  });
  it('uniform STALE → STALE; mix with ERROR only → ERROR', () => {
    expect(rollupQualityStatus(['STALE', 'STALE'])).toBe('STALE');
    expect(rollupQualityStatus(['UNAVAILABLE', 'ERROR'])).toBe('ERROR');
  });
});

describe('E5.1A completeness (preserves E4 limitations, no false full coverage)', () => {
  it('COMPLETE only when ratio=1 and no missing sources', () => {
    expect(
      completenessState('AVAILABLE', { expectedRecords: 3, availableRecords: 3, excludedRecords: 0, ratio: 1, missingSources: [] }),
    ).toBe('COMPLETE');
  });
  it('PARTIAL when missing sources exist even if ratio=1', () => {
    expect(
      completenessState('PARTIAL', { expectedRecords: 3, availableRecords: 3, excludedRecords: 0, ratio: 1, missingSources: ['VEHICLE_ELIGIBILITY_HISTORY'] }),
    ).toBe('PARTIAL');
  });
  it('UNAVAILABLE section → UNAVAILABLE (never fabricated complete)', () => {
    expect(completenessState('UNAVAILABLE', null)).toBe('UNAVAILABLE');
  });
  it('E5.2: null ratio (unknown expected baseline) → UNKNOWN, never fabricated COMPLETE', () => {
    expect(
      completenessState('AVAILABLE', {
        expectedRecords: null,
        availableRecords: 3,
        excludedRecords: 0,
        ratio: null,
        missingSources: [],
      }),
    ).toBe('UNKNOWN');
  });
});

describe('E5.2 VALIDITY (affirmative evidence, never fabricated COMPLETE)', () => {
  it('served statuses report UNKNOWN (no independent validity authority) — never COMPLETE', () => {
    expect(validityState('AVAILABLE')).toBe('UNKNOWN');
    expect(validityState('PARTIAL')).toBe('UNKNOWN');
    expect(validityState('STALE')).toBe('UNKNOWN');
  });
  it('ERROR / UNAVAILABLE / NOT_APPLICABLE → UNAVAILABLE (no valid result to attest)', () => {
    expect(validityState('ERROR')).toBe('UNAVAILABLE');
    expect(validityState('UNAVAILABLE')).toBe('UNAVAILABLE');
    expect(validityState('NOT_APPLICABLE')).toBe('UNAVAILABLE');
  });
  it('never returns a fabricated COMPLETE for any status', () => {
    const statuses = ['AVAILABLE', 'PARTIAL', 'STALE', 'ERROR', 'UNAVAILABLE', 'NOT_APPLICABLE'] as const;
    for (const s of statuses) {
      expect(validityState(s)).not.toBe('COMPLETE');
    }
  });
});

describe('E5.1A dimension helpers', () => {
  it('weakest dimension wins', () => {
    expect(weakestDimension(['COMPLETE', 'UNKNOWN'])).toBe('UNKNOWN');
    expect(weakestDimension(['COMPLETE', 'PARTIAL'])).toBe('PARTIAL');
  });
});
