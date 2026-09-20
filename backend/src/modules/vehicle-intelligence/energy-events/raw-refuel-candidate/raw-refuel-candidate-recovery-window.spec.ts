import type { RawRefuelCandidate } from '@prisma/client';
import {
  computeRawRefuelCandidateRecoveryWindow,
  RAW_REFUEL_CANDIDATE_RECOVERY_MAX_WINDOW_MS,
} from './raw-refuel-candidate-recovery-window';

function ts(iso: string): number {
  return new Date(iso).getTime();
}

describe('computeRawRefuelCandidateRecoveryWindow (F10.6.8-B)', () => {
  const serviceNow = new Date('2026-09-20T00:00:00.000Z');

  const wobPartialCandidate = {
    id: '67f1fac5-b46d-4160-bc7d-b46bcfb18840',
    riseOnsetAt: new Date('2026-09-19T16:11:24.000Z'),
    riseEndAt: new Date('2026-09-19T16:15:27.000Z'),
    physicalEvidenceStart: new Date('2026-09-19T15:40:26.000Z'),
    physicalEvidenceEnd: new Date('2026-09-19T16:15:27.000Z'),
  } as RawRefuelCandidate;

  it('anchors on candidate evidence (not wall clock)', () => {
    const window = computeRawRefuelCandidateRecoveryWindow(
      wobPartialCandidate,
      serviceNow,
    );
    expect(window.start.getTime()).toBeLessThan(ts('2026-09-19T15:48:26.000Z'));
    expect(window.end.getTime()).toBeGreaterThan(ts('2026-09-19T16:58:31.000Z'));
    expect(window.end.getTime() - window.start.getTime()).toBeLessThanOrEqual(
      RAW_REFUEL_CANDIDATE_RECOVERY_MAX_WINDOW_MS + 1,
    );
  });

  it('WOB proof — contains pre, rise, and delayed post samples', () => {
    const window = computeRawRefuelCandidateRecoveryWindow(
      wobPartialCandidate,
      serviceNow,
    );
    const contains = (iso: string) =>
      ts(iso) >= window.start.getTime() && ts(iso) <= window.end.getTime();

    expect(contains('2026-09-19T15:48:26.000Z')).toBe(true);
    expect(contains('2026-09-19T16:11:24.000Z')).toBe(true);
    expect(contains('2026-09-19T16:53:59.000Z')).toBe(true);
    expect(contains('2026-09-19T16:58:31.000Z')).toBe(true);
  });
});
