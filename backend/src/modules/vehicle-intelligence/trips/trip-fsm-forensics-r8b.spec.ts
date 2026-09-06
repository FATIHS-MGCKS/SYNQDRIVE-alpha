import {
  buildMergeReopenRecoveryMeta,
  mergeLifecycleRecoveryMeta,
} from './trip-lifecycle-recovery-meta';
import {
  buildTripFsmForensicsR8V1,
  normalizeFiniteAdjustmentMs,
  resolveStartEpisodeCanonicalAt,
  resolveStartForensicProvenance,
} from './trip-fsm-forensics.util';

describe('R8B — start episode canonical boundary', () => {
  const candidateAt = new Date('2026-09-06T14:00:00.000Z');
  const candidateEnteredAt = new Date('2026-09-06T14:00:20.000Z');
  const effectiveStartAt = new Date('2026-09-06T13:59:50.000Z');
  const historicalTripStart = new Date('2026-09-06T10:00:00.000Z');

  it('R8B.7 — normal create uses confirmedStartAt as episode canonical boundary', () => {
    const provenance = resolveStartForensicProvenance({
      evidenceSummary: {
        startCandidateAt: candidateAt.toISOString(),
        startCandidateEnteredAt: candidateEnteredAt.toISOString(),
        confirmedStartAt: effectiveStartAt.toISOString(),
        startBoundaryAdjustedMs: -10_000,
      },
      detPossibleStartAt: effectiveStartAt,
      detPossibleStartEnteredAt: null,
      tripCanonicalStartAt: effectiveStartAt,
    });

    expect(provenance.startEpisodeCanonicalAt.toISOString()).toBe(
      effectiveStartAt.toISOString(),
    );
    expect(provenance.startBoundaryAdjustedMs).toBe(-10_000);

    const block = buildTripFsmForensicsR8V1({
      startCandidateAt: provenance.startCandidateAt,
      startCandidateEnteredAt: provenance.startCandidateEnteredAt,
      canonicalStartAt: provenance.startEpisodeCanonicalAt,
      tripCanonicalStartAt: effectiveStartAt,
      startBoundaryAdjustedMs: provenance.startBoundaryAdjustedMs,
    });
    expect(block.start.canonicalBoundaryAt).toBe(effectiveStartAt.toISOString());
    expect(block.start.boundaryAdjustmentMs).toBe(-10_000);
    expect(block.start.tripCanonicalStartAt).toBeNull();
  });

  it('R8B.6 — merge/reopen episode canonical differs from historical trip.startTime', () => {
    const mergeCandidateAt = new Date('2026-09-06T16:10:00.000Z');
    const mergeEnteredAt = new Date('2026-09-06T16:10:15.000Z');
    const mergeEffectiveStartAt = new Date('2026-09-06T16:09:55.000Z');
    const mergeRecognizedAt = new Date('2026-09-06T16:10:40.000Z');

    const priorRaw = mergeLifecycleRecoveryMeta({}, {
      mergeReopen: buildMergeReopenRecoveryMeta({
        candidateStartAt: mergeCandidateAt,
        effectiveStartAt: mergeEffectiveStartAt,
      }),
    });

    const provenance = resolveStartForensicProvenance({
      evidenceSummary: {
        startCandidateAt: mergeCandidateAt.toISOString(),
        startCandidateEnteredAt: mergeEnteredAt.toISOString(),
        startRecognizedAt: mergeRecognizedAt.toISOString(),
        confirmedStartAt: mergeEffectiveStartAt.toISOString(),
        startBoundaryAdjustedMs: -5_000,
      },
      detPossibleStartAt: mergeEffectiveStartAt,
      detPossibleStartEnteredAt: null,
      tripCanonicalStartAt: historicalTripStart,
      priorRawDetectionMeta: priorRaw,
    });

    expect(provenance.startEpisodeCanonicalAt.toISOString()).toBe(
      mergeEffectiveStartAt.toISOString(),
    );
    expect(provenance.tripCanonicalStartAt.toISOString()).toBe(
      historicalTripStart.toISOString(),
    );
    expect(provenance.startBoundaryAdjustedMs).toBe(-5_000);

    const block = buildTripFsmForensicsR8V1({
      startCandidateAt: provenance.startCandidateAt,
      startCandidateEnteredAt: provenance.startCandidateEnteredAt,
      startRecognizedAt: provenance.startRecognizedAt,
      canonicalStartAt: provenance.startEpisodeCanonicalAt,
      tripCanonicalStartAt: historicalTripStart,
      startBoundaryAdjustedMs: provenance.startBoundaryAdjustedMs,
    });

    expect(block.start.candidateAt).toBe(mergeCandidateAt.toISOString());
    expect(block.start.candidateEnteredAt).toBe(mergeEnteredAt.toISOString());
    expect(block.start.recognizedAt).toBe(mergeRecognizedAt.toISOString());
    expect(block.start.canonicalBoundaryAt).toBe(mergeEffectiveStartAt.toISOString());
    expect(block.start.tripCanonicalStartAt).toBe(historicalTripStart.toISOString());
    expect(block.start.boundaryAdjustmentMs).toBe(-5_000);
    expect(block.start.canonicalBoundaryAt).not.toBe(historicalTripStart.toISOString());
  });

  it('R8B.8 — recovery falls back to trip.startTime when no episode evidence exists', () => {
    const provenance = resolveStartForensicProvenance({
      evidenceSummary: {
        startRecognizedAt: new Date('2026-09-06T14:00:35.000Z').toISOString(),
        lifecycleRecovery: 'RECOVERABLE_MISSING_POINTER',
      },
      detPossibleStartAt: effectiveStartAt,
      detPossibleStartEnteredAt: null,
      tripCanonicalStartAt: effectiveStartAt,
    });

    expect(provenance.startCandidateAt).toBeNull();
    expect(provenance.startCandidateEnteredAt).toBeNull();
    expect(provenance.startEpisodeCanonicalAt.toISOString()).toBe(
      effectiveStartAt.toISOString(),
    );
  });

  it('R8B.8 — recovery uses confirmed episode boundary when present', () => {
    const provenance = resolveStartForensicProvenance({
      evidenceSummary: {
        confirmedStartAt: effectiveStartAt.toISOString(),
        startRecognizedAt: new Date('2026-09-06T14:00:35.000Z').toISOString(),
        lifecycleRecovery: 'RECOVERABLE_MERGE_ORPHAN',
      },
      detPossibleStartAt: historicalTripStart,
      detPossibleStartEnteredAt: null,
      tripCanonicalStartAt: historicalTripStart,
    });

    expect(provenance.startEpisodeCanonicalAt.toISOString()).toBe(
      effectiveStartAt.toISOString(),
    );
  });

  it('R8B.5 — structured boundaryAdjustmentMs matches flat persisted value', () => {
    const provenance = resolveStartForensicProvenance({
      evidenceSummary: {
        startCandidateAt: candidateAt.toISOString(),
        confirmedStartAt: effectiveStartAt.toISOString(),
        startBoundaryAdjustedMs: -10_000,
      },
      detPossibleStartAt: effectiveStartAt,
      detPossibleStartEnteredAt: null,
      tripCanonicalStartAt: effectiveStartAt,
    });

    const block = buildTripFsmForensicsR8V1({
      startCandidateAt: provenance.startCandidateAt,
      canonicalStartAt: provenance.startEpisodeCanonicalAt,
      startBoundaryAdjustedMs: provenance.startBoundaryAdjustedMs,
    });

    expect(block.start.boundaryAdjustmentMs).toBe(provenance.startBoundaryAdjustedMs);
    expect(block.start.boundaryAdjustmentMs).toBe(-10_000);
  });
});

describe('R8B.9 — finite signed adjustment', () => {
  const candidateAt = new Date('2026-09-06T14:00:00.000Z');
  const effectiveStartAt = new Date('2026-09-06T13:59:50.000Z');

  it('rejects NaN and Infinity persisted values and recomputes', () => {
    expect(normalizeFiniteAdjustmentMs(Number.NaN)).toBeNull();
    expect(normalizeFiniteAdjustmentMs(Number.POSITIVE_INFINITY)).toBeNull();

    const provenance = resolveStartForensicProvenance({
      evidenceSummary: {
        startCandidateAt: candidateAt.toISOString(),
        confirmedStartAt: effectiveStartAt.toISOString(),
        startBoundaryAdjustedMs: Number.NaN,
      },
      detPossibleStartAt: effectiveStartAt,
      detPossibleStartEnteredAt: null,
      tripCanonicalStartAt: effectiveStartAt,
    });

    expect(provenance.startBoundaryAdjustedMs).toBe(-10_000);
  });

  it('resolveStartEpisodeCanonicalAt prefers confirmedStartAt over merge reopen meta', () => {
    const confirmed = new Date('2026-09-06T16:09:55.000Z');
    const mergeMeta = new Date('2026-09-06T16:08:00.000Z');
    const tripStart = new Date('2026-09-06T10:00:00.000Z');
    const priorRaw = mergeLifecycleRecoveryMeta({}, {
      mergeReopen: buildMergeReopenRecoveryMeta({
        candidateStartAt: candidateAt,
        effectiveStartAt: mergeMeta,
      }),
    });

    expect(
      resolveStartEpisodeCanonicalAt({
        evidenceSummary: { confirmedStartAt: confirmed.toISOString() },
        priorRawDetectionMeta: priorRaw,
        tripCanonicalStartAt: tripStart,
      }).toISOString(),
    ).toBe(confirmed.toISOString());
  });
});
