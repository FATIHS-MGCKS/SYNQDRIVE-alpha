import {
  GENERIC_NATIVE_RECHARGE_COMPLETED_SEGMENT,
  GENERIC_NATIVE_RECHARGE_TOKEN_ID,
  TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1,
  TESLA_RECHARGE_AUDIT_TOKEN_ID,
} from './dimo-recharge-segments.fixtures';
import { withSyntheticProviderId } from './dimo-recharge-segments.fixtures.synthetic';
import {
  normalizeDimoRechargeSegment,
  numericDeltaFromExtrema,
  parseCanonicalSegmentInstant,
} from './dimo-recharge-segments.normalizer';
import { dedupeNormalizedRechargeSegmentsByFingerprint } from './dimo-recharge-segments.dedupe';
import { mapRechargeSegmentToEnergyEvent } from './dimo-recharge-segments.mapper';

describe('dimo-recharge-segments.normalizer (E2)', () => {
  it('rejects invalid start and end-before-start', () => {
    expect(
      normalizeDimoRechargeSegment(1, {
        start: { timestamp: 'not-a-date' },
        end: { timestamp: '2026-01-02T00:00:00.000Z' },
        isOngoing: false,
        signals: [],
      }),
    ).toBeNull();

    expect(
      normalizeDimoRechargeSegment(1, {
        start: { timestamp: '2026-01-02T00:00:00.000Z' },
        end: { timestamp: '2026-01-01T00:00:00.000Z' },
        isOngoing: false,
        signals: [],
      }),
    ).toBeNull();
  });

  it('computes extrema order-independently without agg labels', () => {
    const raw = {
      start: { timestamp: '2026-01-01T10:00:00.000Z', value: {} },
      end: { timestamp: '2026-01-01T12:00:00.000Z', value: {} },
      duration: 7200,
      isOngoing: false,
      signals: [
        { name: 'powertrainTractionBatteryStateOfChargeCurrent', value: 55 },
        { name: 'powertrainTractionBatteryStateOfChargeCurrent', value: 40 },
      ],
    };
    const normalized = normalizeDimoRechargeSegment(99, raw);
    expect(normalized!.soc.min).toBe(40);
    expect(normalized!.soc.max).toBe(55);
    expect(normalized!.soc.delta).toBe(15);
  });

  it('distinguishes known zero delta from unknown', () => {
    expect(numericDeltaFromExtrema(50, 50)).toBe(0);
    expect(numericDeltaFromExtrema(null, 50)).toBeNull();
    expect(numericDeltaFromExtrema(60, 50)).toBeNull();
  });

  it('does not default missing completed duration to zero when boundaries exist', () => {
    const raw = {
      start: { timestamp: '2026-01-01T10:00:00.000Z', value: {} },
      end: { timestamp: '2026-01-01T11:00:00.000Z', value: {} },
      duration: null,
      isOngoing: false,
      signals: [
        { name: 'powertrainTractionBatteryStateOfChargeCurrent', value: 10 },
        { name: 'powertrainTractionBatteryStateOfChargeCurrent', value: 20 },
      ],
    };
    const normalized = normalizeDimoRechargeSegment(1, raw)!;
    expect(normalized.durationSeconds).toBe(3600);
    expect(normalized.durationProvenance).toBe('DERIVED_BOUNDARY_DURATION');
  });

  it('dedupes by fingerprint and prefers completed over ongoing', () => {
    const start = '2026-06-15T17:47:29.000Z';
    const fingerprint = `dimo-recharge-${TESLA_RECHARGE_AUDIT_TOKEN_ID}-${new Date(start).getTime()}`;
    const ongoing = normalizeDimoRechargeSegment(
      TESLA_RECHARGE_AUDIT_TOKEN_ID,
      {
        start: { timestamp: start, value: {} },
        end: null,
        duration: 100,
        isOngoing: true,
        signals: [
          { name: 'powertrainTractionBatteryStateOfChargeCurrent', value: 40 },
          { name: 'powertrainTractionBatteryStateOfChargeCurrent', value: 45 },
        ],
      },
    )!;
    const completed = normalizeDimoRechargeSegment(
      TESLA_RECHARGE_AUDIT_TOKEN_ID,
      TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[0],
    )!;
    expect(completed.fingerprint).toBe(fingerprint);

    const deduped = dedupeNormalizedRechargeSegmentsByFingerprint([ongoing, completed]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].ongoing).toBe(false);
    expect(deduped[0].fingerprint).toBe(fingerprint);
  });

  it('keeps single fingerprint when synthetic provider id appears later', () => {
    const base = TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[1];
    const withoutId = normalizeDimoRechargeSegment(TESLA_RECHARGE_AUDIT_TOKEN_ID, base)!;
    const withId = normalizeDimoRechargeSegment(
      TESLA_RECHARGE_AUDIT_TOKEN_ID,
      withSyntheticProviderId(base),
    )!;
    expect(withoutId.fingerprint).toBe(withId.fingerprint);
    const deduped = dedupeNormalizedRechargeSegmentsByFingerprint([withoutId, withId]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].providerSegmentId).toBeTruthy();
  });

  it('preserves legacy VEE mapping for completed audit segment', () => {
    const normalized = normalizeDimoRechargeSegment(
      TESLA_RECHARGE_AUDIT_TOKEN_ID,
      TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[0],
    )!;
    const legacy = mapRechargeSegmentToEnergyEvent(normalized);
    expect(legacy.startTime).toBe('2026-06-15T17:47:29.000Z');
    expect(legacy.endTime).toBe('2026-06-16T10:39:23.000Z');
    expect(legacy.durationSeconds).toBe(60714);
    expect(legacy.socDeltaPercent).toBeCloseTo(7.3, 1);
  });

  it('normalizes generic native-capable segment without OEM fields', () => {
    const normalized = normalizeDimoRechargeSegment(
      GENERIC_NATIVE_RECHARGE_TOKEN_ID,
      GENERIC_NATIVE_RECHARGE_COMPLETED_SEGMENT,
    )!;
    expect(normalized.soc.provenance).toBe('SEGMENT_EXTREMA');
    expect(parseCanonicalSegmentInstant(normalized.startAt)).toBe(normalized.startAt);
  });
});
