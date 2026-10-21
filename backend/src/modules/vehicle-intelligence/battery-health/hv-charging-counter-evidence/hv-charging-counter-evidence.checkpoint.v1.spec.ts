import { mergeRevalidationCheckpointMonotonicV1 } from './hv-charging-counter-evidence.checkpoint.v1';

describe('mergeRevalidationCheckpointMonotonicV1', () => {
  const fpA = 'a'.repeat(64);
  const fpB = 'b'.repeat(64);

  it('keeps the newer queriedAt and fingerprint on forward progress', () => {
    const t0 = new Date('2026-10-16T10:00:00.000Z');
    const t1 = new Date('2026-10-16T16:00:00.000Z');
    const merged = mergeRevalidationCheckpointMonotonicV1(
      { lastProviderQueryAt: t0, lastObservationSetFingerprint: fpA },
      { queriedAt: t1, observationSetFingerprint: fpB },
    );
    expect(merged.lastProviderQueryAt).toEqual(t1);
    expect(merged.lastObservationSetFingerprint).toBe(fpB);
  });

  it('on equal queriedAt incoming fingerprint replaces existing (>= policy)', () => {
    const t = new Date('2026-10-16T16:00:00.000Z');
    const merged = mergeRevalidationCheckpointMonotonicV1(
      { lastProviderQueryAt: t, lastObservationSetFingerprint: fpA },
      { queriedAt: t, observationSetFingerprint: fpB },
    );
    expect(merged.lastProviderQueryAt).toEqual(t);
    expect(merged.lastObservationSetFingerprint).toBe(fpB);
  });

  it('ignores out-of-order older queriedAt and preserves newer checkpoint state', () => {
    const t0 = new Date('2026-10-16T10:00:00.000Z');
    const tLate = new Date('2026-10-16T16:00:00.000Z');
    const merged = mergeRevalidationCheckpointMonotonicV1(
      { lastProviderQueryAt: tLate, lastObservationSetFingerprint: fpB },
      { queriedAt: t0, observationSetFingerprint: fpA },
    );
    expect(merged.lastProviderQueryAt).toEqual(tLate);
    expect(merged.lastObservationSetFingerprint).toBe(fpB);
  });
});
