import { normalizeDimoRechargeSegment } from './dimo-recharge-segments.normalizer';
import {
  dedupeNormalizedRechargeSegmentsByFingerprint,
  stableDedupeTieBreakKey,
} from './dimo-recharge-segments.dedupe';
import {
  TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1,
  TESLA_RECHARGE_AUDIT_TOKEN_ID,
} from './dimo-recharge-segments.fixtures';
import { withSyntheticProviderId } from './dimo-recharge-segments.fixtures.synthetic';
import type { NormalizedDimoRechargeSegment } from './dimo-recharge-segments.types';

function assertSegmentsSemanticallyEqual(
  a: NormalizedDimoRechargeSegment,
  b: NormalizedDimoRechargeSegment,
): void {
  expect(a.fingerprint).toBe(b.fingerprint);
  expect(a.ongoing).toBe(b.ongoing);
  expect(a.endAt).toBe(b.endAt);
  expect(a.durationSeconds).toBe(b.durationSeconds);
  expect(a.soc).toEqual(b.soc);
  expect(a.currentEnergyKwh).toEqual(b.currentEnergyKwh);
  expect(a.addedEnergyKwh).toEqual(b.addedEnergyKwh);
  expect(a.isCharging).toEqual(b.isCharging);
  expect(a.cableConnected).toEqual(b.cableConnected);
  expect(a.providerSegmentId).toBe(b.providerSegmentId);
  expect(a.startLocation).toEqual(b.startLocation);
  expect(a.endLocation).toEqual(b.endLocation);
  expect(a.odometerKm).toEqual(b.odometerKm);
}

describe('dedupeNormalizedRechargeSegmentsByFingerprint (E2.1 total order)', () => {
  it('preserves providerSegmentId regardless of order', () => {
    const base = TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[1];
    const withoutId = normalizeDimoRechargeSegment(TESLA_RECHARGE_AUDIT_TOKEN_ID, base)!;
    const withId = normalizeDimoRechargeSegment(
      TESLA_RECHARGE_AUDIT_TOKEN_ID,
      withSyntheticProviderId(base),
    )!;

    const forward = dedupeNormalizedRechargeSegmentsByFingerprint([withoutId, withId])[0];
    const reverse = dedupeNormalizedRechargeSegmentsByFingerprint([withId, withoutId])[0];

    expect(forward.providerSegmentId).toBeTruthy();
    expect(reverse.providerSegmentId).toBeTruthy();
    expect(forward.providerSegmentId).toBe(reverse.providerSegmentId);
    assertSegmentsSemanticallyEqual(forward, reverse);
  });

  it('prefers completed over ongoing in both orders', () => {
    const completedRaw = TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[0];
    const completed = normalizeDimoRechargeSegment(
      TESLA_RECHARGE_AUDIT_TOKEN_ID,
      completedRaw,
    )!;
    const ongoing = normalizeDimoRechargeSegment(TESLA_RECHARGE_AUDIT_TOKEN_ID, {
      start: completedRaw.start,
      end: null,
      duration: 600,
      isOngoing: true,
      signals: completedRaw.signals,
    })!;

    const forward = dedupeNormalizedRechargeSegmentsByFingerprint([ongoing, completed])[0];
    const reverse = dedupeNormalizedRechargeSegmentsByFingerprint([completed, ongoing])[0];

    expect(forward.ongoing).toBe(false);
    expect(reverse.ongoing).toBe(false);
    assertSegmentsSemanticallyEqual(forward, reverse);
  });

  it('prefers richer evidence over sparse in both orders', () => {
    const completedRaw = TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[0];
    const rich = normalizeDimoRechargeSegment(TESLA_RECHARGE_AUDIT_TOKEN_ID, completedRaw)!;
    const sparse = normalizeDimoRechargeSegment(TESLA_RECHARGE_AUDIT_TOKEN_ID, {
      start: completedRaw.start,
      end: completedRaw.end,
      duration: completedRaw.duration,
      isOngoing: false,
      signals: [
        { name: 'powertrainTractionBatteryStateOfChargeCurrent', value: 41 },
        { name: 'powertrainTractionBatteryStateOfChargeCurrent', value: 48 },
      ],
    })!;

    const forward = dedupeNormalizedRechargeSegmentsByFingerprint([sparse, rich])[0];
    const reverse = dedupeNormalizedRechargeSegmentsByFingerprint([rich, sparse])[0];

    expect(forward.signalRows.length).toBeGreaterThan(sparse.signalRows.length);
    assertSegmentsSemanticallyEqual(forward, reverse);
  });

  it('returns identical winner for exact duplicates in both orders', () => {
    const seg = normalizeDimoRechargeSegment(
      TESLA_RECHARGE_AUDIT_TOKEN_ID,
      TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[1],
    )!;
    const copy: NormalizedDimoRechargeSegment = {
      ...seg,
      signalRows: [...seg.signalRows],
    };

    const forward = dedupeNormalizedRechargeSegmentsByFingerprint([seg, copy])[0];
    const reverse = dedupeNormalizedRechargeSegmentsByFingerprint([copy, seg])[0];

    expect(stableDedupeTieBreakKey(forward)).toBe(stableDedupeTieBreakKey(reverse));
    assertSegmentsSemanticallyEqual(forward, reverse);
  });

  it('resolves equal-rank conflicts deterministically without input-order bias', () => {
    const completedRaw = TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[1];
    const a = normalizeDimoRechargeSegment(TESLA_RECHARGE_AUDIT_TOKEN_ID, {
      ...completedRaw,
      duration: 8000,
    })!;
    const b = normalizeDimoRechargeSegment(TESLA_RECHARGE_AUDIT_TOKEN_ID, {
      ...completedRaw,
      duration: 9000,
    })!;

    const forward = dedupeNormalizedRechargeSegmentsByFingerprint([a, b])[0];
    const reverse = dedupeNormalizedRechargeSegmentsByFingerprint([b, a])[0];

    assertSegmentsSemanticallyEqual(forward, reverse);
    expect(forward.durationSeconds).toBe(reverse.durationSeconds);
  });
});
