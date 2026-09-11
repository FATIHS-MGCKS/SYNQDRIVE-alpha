import {
  buildGapSettlementMatrix,
  extractNativeTemporalGaps,
  summarizeGapSettlementMatrix,
  EXP021_GAP_SETTLEMENT_MIN_GAP_MS,
} from './reference-capture-exp021-gap-settlement-analyzer';
import { EXP021_MANDATORY_AGES_MS } from './reference-capture-settlement-shadow.policy';

const probeA = {
  probeId: 'SP-60-A',
  phaseLabel: '60s',
  sourceIntervalStartIso: '2026-09-10T19:43:19.000Z',
  sourceIntervalEndIso: '2026-09-10T19:44:19.000Z',
};

describe('reference-capture-exp021-gap-settlement-analyzer', () => {
  it('extracts native temporal gaps >= min threshold', () => {
    const gaps = extractNativeTemporalGaps({
      phaseLabel: '60s',
      nativeTemporalBucketStarts: [
        '2026-09-10T19:43:19.000Z',
        '2026-09-10T19:43:29.000Z',
        '2026-09-10T19:44:00.000Z',
      ],
      minGapMs: EXP021_GAP_SETTLEMENT_MIN_GAP_MS,
    });
    expect(gaps.length).toBeGreaterThanOrEqual(1);
    expect(gaps.some((g) => g.gapDurationMs === 31_000)).toBe(true);
  });

  it('classifies interior bucket FIRST_SEEN_AT_60 when absent at +30', () => {
    const matrix = buildGapSettlementMatrix({
      phaseLabel: '60s',
      nativeTemporalBucketStarts: [
        '2026-09-10T19:43:19.000Z',
        '2026-09-10T19:44:00.000Z',
      ],
      minGapMs: EXP021_GAP_SETTLEMENT_MIN_GAP_MS,
      primaryField: 'speed',
      probes: [probeA],
      observationsByProbeId: {
        'SP-60-A': [
          {
            probeId: 'SP-60-A',
            scheduledAgeMs: 30_000,
            providerRequestStatus: 'SUCCESS',
            rawRowCount: 10,
            uniqueBucketIdentities: [],
          },
          {
            probeId: 'SP-60-A',
            scheduledAgeMs: 60_000,
            providerRequestStatus: 'SUCCESS',
            rawRowCount: 10,
            uniqueBucketIdentities: [
              'speed|2026-09-10T19:43:24.000Z',
              'speed|2026-09-10T19:43:29.000Z',
            ],
          },
        ],
      },
    });
    const recovered = matrix.filter((r) => r.settlementClassification === 'FIRST_SEEN_AT_60');
    expect(recovered.length).toBeGreaterThan(0);
  });

  it('marks gaps without overlapping probe NOT_ASSESSABLE', () => {
    const matrix = buildGapSettlementMatrix({
      phaseLabel: '60s',
      nativeTemporalBucketStarts: [
        '2026-09-10T19:50:00.000Z',
        '2026-09-10T19:51:00.000Z',
      ],
      minGapMs: EXP021_GAP_SETTLEMENT_MIN_GAP_MS,
      primaryField: 'speed',
      probes: [probeA],
      observationsByProbeId: {},
    });
    expect(
      matrix.every((r) => r.overlapClassification === 'NOT_ASSESSABLE_NO_OVERLAPPING_SETTLEMENT_PROBE'),
    ).toBe(true);
    const summary = summarizeGapSettlementMatrix(matrix);
    expect(summary.nativeGapsNotAssessableNoOverlap).toBeGreaterThan(0);
  });

  it('classifies NEVER_SEEN_BY_600 when bucket absent through +600', () => {
    const matrix = buildGapSettlementMatrix({
      phaseLabel: '60s',
      nativeTemporalBucketStarts: [
        '2026-09-10T19:43:19.000Z',
        '2026-09-10T19:44:00.000Z',
      ],
      minGapMs: EXP021_GAP_SETTLEMENT_MIN_GAP_MS,
      primaryField: 'speed',
      probes: [probeA],
      observationsByProbeId: {
        'SP-60-A': EXP021_MANDATORY_AGES_MS.map((age) => ({
          probeId: 'SP-60-A',
          scheduledAgeMs: age,
          providerRequestStatus: 'SUCCESS',
          rawRowCount: 5,
          uniqueBucketIdentities: ['speed|2026-09-10T19:43:19.000Z'],
        })),
      },
    });
    const neverSeen = matrix.filter((r) => r.settlementClassification === 'NEVER_SEEN_BY_600');
    expect(neverSeen.length).toBeGreaterThan(0);
  });
});
