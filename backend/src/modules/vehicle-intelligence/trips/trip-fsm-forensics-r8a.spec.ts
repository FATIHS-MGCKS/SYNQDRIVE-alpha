import {
  buildTripFsmForensicsR8V1,
  parseStrictEvidenceTimestamp,
  resolveStartForensicProvenance,
  safeForensicIsoString,
} from './trip-fsm-forensics.util';

describe('R8A — start forensic provenance', () => {
  const candidateAt = new Date('2026-09-06T14:00:00.000Z');
  const candidateEnteredAt = new Date('2026-09-06T14:00:20.000Z');
  const canonicalStartAt = new Date('2026-09-06T13:59:50.000Z');
  const startRecognizedAt = new Date('2026-09-06T14:00:35.000Z');

  it('R8A.3 — refined start preserves original candidate episode at FINALIZE', () => {
    const evidenceSummary = {
      startCandidateAt: candidateAt.toISOString(),
      startCandidateEnteredAt: candidateEnteredAt.toISOString(),
      startRecognizedAt: startRecognizedAt.toISOString(),
      confirmedStartSource: 'core_refined',
      startEvidencePath: 'DIMO_ONLY',
      startBoundaryAdjustedMs: -10_000,
    };

    const provenance = resolveStartForensicProvenance({
      evidenceSummary,
      detPossibleStartAt: canonicalStartAt,
      detPossibleStartEnteredAt: null,
      canonicalStartAt,
    });

    expect(provenance.startCandidateAt?.toISOString()).toBe(candidateAt.toISOString());
    expect(provenance.startCandidateEnteredAt?.toISOString()).toBe(
      candidateEnteredAt.toISOString(),
    );
    expect(provenance.startRecognizedAt?.toISOString()).toBe(
      startRecognizedAt.toISOString(),
    );
    expect(provenance.startBoundaryAdjustedMs).toBe(-10_000);

    const block = buildTripFsmForensicsR8V1({
      startCandidateAt: provenance.startCandidateAt,
      startCandidateEnteredAt: provenance.startCandidateEnteredAt,
      startRecognizedAt: provenance.startRecognizedAt,
      canonicalStartAt,
      startBoundarySource: provenance.startBoundarySource,
      startEvidencePath: provenance.startEvidencePath,
    });

    expect(block.start.candidateAt).toBe(candidateAt.toISOString());
    expect(block.start.candidateEnteredAt).toBe(candidateEnteredAt.toISOString());
    expect(block.start.recognizedAt).toBe(startRecognizedAt.toISOString());
    expect(block.start.canonicalBoundaryAt).toBe(canonicalStartAt.toISOString());
    expect(block.start.boundaryAdjustmentMs).toBe(-10_000);
    expect(provenance.flatStartCandidateAt).toBe(candidateAt.toISOString());
  });

  it('R8A.4 — merge/reopen uses new start episode, not old trip.startTime', () => {
    const mergeCandidateAt = new Date('2026-09-06T16:10:00.000Z');
    const mergeEnteredAt = new Date('2026-09-06T16:10:15.000Z');
    const effectiveStartAt = new Date('2026-09-06T16:09:55.000Z');
    const oldTripStartTime = new Date('2026-09-06T10:00:00.000Z');

    const provenance = resolveStartForensicProvenance({
      evidenceSummary: {
        startCandidateAt: mergeCandidateAt.toISOString(),
        startCandidateEnteredAt: mergeEnteredAt.toISOString(),
        startRecognizedAt: new Date('2026-09-06T16:10:40.000Z').toISOString(),
        confirmedStartSource: 'merge_reopen',
        startBoundaryAdjustedMs: -5_000,
      },
      detPossibleStartAt: effectiveStartAt,
      detPossibleStartEnteredAt: null,
      canonicalStartAt: oldTripStartTime,
    });

    expect(provenance.startCandidateAt?.toISOString()).toBe(mergeCandidateAt.toISOString());
    expect(provenance.startCandidateEnteredAt?.toISOString()).toBe(
      mergeEnteredAt.toISOString(),
    );
    expect(provenance.startBoundaryAdjustedMs).toBe(-5_000);
  });

  it('R8A.5 — recovery path preserves evidence when present, null otherwise', () => {
    const withEvidence = resolveStartForensicProvenance({
      evidenceSummary: {
        startCandidateAt: candidateAt.toISOString(),
        startCandidateEnteredAt: candidateEnteredAt.toISOString(),
        startRecognizedAt: startRecognizedAt.toISOString(),
      },
      detPossibleStartAt: canonicalStartAt,
      detPossibleStartEnteredAt: null,
      canonicalStartAt,
    });
    expect(withEvidence.startCandidateAt).toEqual(candidateAt);
    expect(withEvidence.startCandidateEnteredAt).toEqual(candidateEnteredAt);

    const withoutEvidence = resolveStartForensicProvenance({
      evidenceSummary: {
        startRecognizedAt: startRecognizedAt.toISOString(),
        lifecycleRecovery: 'RECOVERABLE_MISSING_POINTER',
      },
      detPossibleStartAt: canonicalStartAt,
      detPossibleStartEnteredAt: null,
      canonicalStartAt,
    });
    expect(withoutEvidence.startCandidateAt).toBeNull();
    expect(withoutEvidence.startCandidateEnteredAt).toBeNull();
    expect(withoutEvidence.startRecognizedAt).toEqual(startRecognizedAt);
  });

  it('prefers startCandidateObservedAt when startCandidateAt absent', () => {
    const observedAt = new Date('2026-09-06T15:00:00.000Z');
    const provenance = resolveStartForensicProvenance({
      evidenceSummary: {
        startCandidateObservedAt: observedAt.toISOString(),
        startCandidateEnteredAt: candidateEnteredAt.toISOString(),
      },
      detPossibleStartAt: canonicalStartAt,
      detPossibleStartEnteredAt: null,
      canonicalStartAt,
    });
    expect(provenance.startCandidateAt).toEqual(observedAt);
  });
});

describe('R8A — strict evidence timestamp parsing', () => {
  it('parseStrictEvidenceTimestamp accepts valid Date and ISO strings', () => {
    const d = new Date('2026-09-06T12:00:00.000Z');
    expect(parseStrictEvidenceTimestamp(d)).toEqual(d);
    expect(parseStrictEvidenceTimestamp(d.toISOString())).toEqual(d);
  });

  it('returns null for null, undefined, invalid Date, and invalid strings', () => {
    expect(parseStrictEvidenceTimestamp(null)).toBeNull();
    expect(parseStrictEvidenceTimestamp(undefined)).toBeNull();
    expect(parseStrictEvidenceTimestamp(new Date(Number.NaN))).toBeNull();
    expect(parseStrictEvidenceTimestamp('not-a-date')).toBeNull();
  });

  it('R8A.15 — buildTripFsmForensicsR8V1 null-safe for invalid optional dates', () => {
    const block = buildTripFsmForensicsR8V1({
      startCandidateAt: new Date(Number.NaN),
      startCandidateEnteredAt: new Date(Number.NaN),
      canonicalStartAt: new Date('2026-09-06T12:00:00.000Z'),
    });
    expect(block.start.candidateAt).toBeNull();
    expect(block.start.candidateEnteredAt).toBeNull();
    expect(block.start.canonicalBoundaryAt).toBe('2026-09-06T12:00:00.000Z');
    expect(safeForensicIsoString(new Date(Number.NaN))).toBeNull();
  });
});
