import { BatteryEvidenceScope, BatteryGroundTruthType } from '@prisma/client';
import {
  buildM3_3HvH4ChargeThroughputReportV1,
  validateM3_3HvH4ChargeThroughputReportContract,
} from './m3-3-hv-h4-charge-throughput-report.builder';
import {
  detectOverlappingEligibleNativeSessions,
  hvChargeSessionsStrictlyOverlap,
} from './m3-3-hv-h4-charge-throughput-session.v1';
import { buildM3_3HvH4CoverageReportV1 } from './m3-3-hv-h4-coverage-report.builder';
import {
  M3_3_HV_H4_BOUNDED_CHARGE_THROUGHPUT_V1,
  M3_3_HV_H4_DEFAULT_RETENTION_DAYS,
  M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
} from './m3-3-hv-h4.constants';
import type { M3_3HvH4LoadedDataV1 } from './m3-3-hv-h4-loaded-data.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import {
  HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
  HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
} from '../hv-charge-session/hv-charge-session.types';

function baseLoaded(overrides: Partial<M3_3HvH4LoadedDataV1>): M3_3HvH4LoadedDataV1 {
  const evaluationAt = overrides.evaluationAt ?? new Date('2026-09-01T00:00:00.000Z');
  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    evaluationAt,
    groundTruthEvents: [],
    chargeSessions: [],
    chargeSessionSourceLoad: {
      loadedCount: 0,
      hardLimit: 5000,
      sourceTruncated: false,
      hardLimitReached: false,
    },
    hvSnapshotRecordedAt: [],
    hvSocEvidenceObservedAt: [],
    hvTemperatureEvidenceObservedAt: [],
    hvChargingPowerEvidenceObservedAt: [],
    retentionCutoffs: {
      hvChargeSessionEarliestRemaining: new Date(
        evaluationAt.getTime() - M3_3_HV_H4_DEFAULT_RETENTION_DAYS.hvChargeSessions * 86400000,
      ),
      hvSnapshotEarliestRemaining: new Date(
        evaluationAt.getTime() - M3_3_HV_H4_DEFAULT_RETENTION_DAYS.hvProviderSnapshots * 86400000,
      ),
    },
    ...overrides,
  };
}

function nativeSession(
  partial: Partial<M3_3HvH4LoadedDataV1['chargeSessions'][number]> & {
    id: string;
    startAt: Date;
    endAt: Date;
    energyAddedKwh: number;
  },
): M3_3HvH4LoadedDataV1['chargeSessions'][number] {
  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    measurementSessionId: null,
    segmentFingerprint: `fp-${partial.id}`,
    dimoSegmentId: `dimo-${partial.id}`,
    source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
    startSocPercent: 20,
    endSocPercent: 80,
    startEnergyKwh: 10,
    endEnergyKwh: 40,
    deltaSocPercent: 60,
    isOngoing: false,
    quality: null,
    idempotencyKey: `k-${partial.id}`,
    providerObservedAt: partial.endAt,
    receivedAt: partial.endAt,
    metadata: {
      qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
      addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
    },
    createdAt: partial.startAt,
    updatedAt: partial.endAt,
    ...partial,
  };
}

function buildReport(loaded: M3_3HvH4LoadedDataV1) {
  const coverage = buildM3_3HvH4CoverageReportV1(loaded);
  const report = buildM3_3HvH4ChargeThroughputReportV1({ data: loaded, coverage });
  validateM3_3HvH4ChargeThroughputReportContract(report);
  return report;
}

describe('M3.3-HV-H4-A2 bounded charge throughput composition', () => {
  it('sums eligible native sessions per lifecycle segment without cross-replacement pooling', () => {
    const replacementAt = new Date('2026-06-01T00:00:00.000Z');
    const loaded = baseLoaded({
      groundTruthEvents: [
        {
          id: 'gt-1',
          batteryScope: BatteryEvidenceScope.HV,
          groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
          effectiveAt: replacementAt,
          createdAt: replacementAt,
          verificationStatus: 'CONFIRMED',
          revocations: [],
          supersededByGroundTruthEvents: [],
        },
      ],
      chargeSessions: [
        nativeSession({
          id: 'pre-a',
          startAt: new Date('2026-05-01T08:00:00.000Z'),
          endAt: new Date('2026-05-01T10:00:00.000Z'),
          energyAddedKwh: 12,
        }),
        nativeSession({
          id: 'pre-b',
          startAt: new Date('2026-05-15T08:00:00.000Z'),
          endAt: new Date('2026-05-15T10:00:00.000Z'),
          energyAddedKwh: 8,
        }),
        nativeSession({
          id: 'post-a',
          startAt: new Date('2026-07-01T08:00:00.000Z'),
          endAt: new Date('2026-07-01T10:00:00.000Z'),
          energyAddedKwh: 18,
        }),
      ],
    });
    const report = buildReport(loaded);
    const seg0 = report.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_0');
    const seg1 = report.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_1');
    expect(seg0?.compositionStatus).toBe('AVAILABLE_OBSERVED_GAP_AWARE');
    expect(seg0?.boundedObservedChargeThroughputKwh).toBe(20);
    expect(seg1?.boundedObservedChargeThroughputKwh).toBe(18);
    expect(report.contractVersion).toBe(M3_3_HV_H4_BOUNDED_CHARGE_THROUGHPUT_V1);
  });

  it('returns null throughput for NO_TRUSTED_SESSIONS', () => {
    const report = buildReport(baseLoaded({}));
    const seg0 = report.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_0');
    expect(seg0?.compositionStatus).toBe('NO_TRUSTED_SESSIONS');
    expect(seg0?.boundedObservedChargeThroughputKwh).toBeNull();
  });

  it('fail-closes on source truncation without partial sum', () => {
    const loaded = baseLoaded({
      chargeSessionSourceLoad: {
        loadedCount: 5000,
        hardLimit: 5000,
        sourceTruncated: true,
        hardLimitReached: true,
      },
      chargeSessions: [
        nativeSession({
          id: 's1',
          startAt: new Date('2026-07-01T08:00:00.000Z'),
          endAt: new Date('2026-07-01T10:00:00.000Z'),
          energyAddedKwh: 11,
        }),
      ],
    });
    const report = buildReport(loaded);
    const seg0 = report.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_0');
    expect(seg0?.compositionStatus).toBe('SOURCE_TRUNCATED');
    expect(seg0?.boundedObservedChargeThroughputKwh).toBeNull();
  });

  it('excludes fallback and non-positive native energy', () => {
    const report = buildReport(
      baseLoaded({
        chargeSessions: [
          {
            ...nativeSession({
              id: 'fb',
              startAt: new Date('2026-07-01T08:00:00.000Z'),
              endAt: new Date('2026-07-01T10:00:00.000Z'),
              energyAddedKwh: 9,
            }),
            source: HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
          },
          nativeSession({
            id: 'zero',
            startAt: new Date('2026-07-02T08:00:00.000Z'),
            endAt: new Date('2026-07-02T10:00:00.000Z'),
            energyAddedKwh: 0,
          }),
        ],
      }),
    );
    const seg0 = report.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_0');
    expect(seg0?.compositionStatus).toBe('NO_TRUSTED_SESSIONS');
    expect(seg0?.excludedCountsByEligibility.CONTEXT_ONLY).toBeGreaterThan(0);
    expect(seg0?.excludedCountsByEligibility.INELIGIBLE_NON_POSITIVE_ENERGY).toBe(1);
  });

  it('fail-closes overlapping eligible native sessions', () => {
    const loaded = baseLoaded({
      chargeSessions: [
        nativeSession({
          id: 'a',
          startAt: new Date('2026-07-01T08:00:00.000Z'),
          endAt: new Date('2026-07-01T12:00:00.000Z'),
          energyAddedKwh: 10,
        }),
        nativeSession({
          id: 'b',
          startAt: new Date('2026-07-01T10:00:00.000Z'),
          endAt: new Date('2026-07-01T14:00:00.000Z'),
          energyAddedKwh: 12,
          dimoSegmentId: 'dimo-other',
          segmentFingerprint: 'fp-b',
        }),
      ],
    });
    const report = buildReport(loaded);
    const seg0 = report.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_0');
    expect(seg0?.compositionStatus).toBe('SOURCE_CONFLICT');
    expect(seg0?.boundedObservedChargeThroughputKwh).toBeNull();
  });

  it('allows adjacent native sessions', () => {
    expect(
      hvChargeSessionsStrictlyOverlap(
        {
          startAt: new Date('2026-07-01T08:00:00.000Z'),
          endAt: new Date('2026-07-01T10:00:00.000Z'),
        },
        {
          startAt: new Date('2026-07-01T10:00:00.000Z'),
          endAt: new Date('2026-07-01T12:00:00.000Z'),
        },
      ),
    ).toBe(false);
    const report = buildReport(
      baseLoaded({
        chargeSessions: [
          nativeSession({
            id: 'a',
            startAt: new Date('2026-07-01T08:00:00.000Z'),
            endAt: new Date('2026-07-01T10:00:00.000Z'),
            energyAddedKwh: 5,
          }),
          nativeSession({
            id: 'b',
            startAt: new Date('2026-07-01T10:00:00.000Z'),
            endAt: new Date('2026-07-01T12:00:00.000Z'),
            energyAddedKwh: 7,
            dimoSegmentId: 'dimo-b',
            segmentFingerprint: 'fp-b',
          }),
        ],
      }),
    );
    const seg0 = report.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_0');
    expect(seg0?.compositionStatus).toBe('AVAILABLE_OBSERVED_GAP_AWARE');
    expect(seg0?.boundedObservedChargeThroughputKwh).toBe(12);
  });

  it('fail-closes on duplicate provider segment identity', () => {
    const report = buildReport(
      baseLoaded({
        chargeSessions: [
          nativeSession({
            id: 'a',
            dimoSegmentId: 'same-provider',
            segmentFingerprint: 'fp-a',
            startAt: new Date('2026-07-01T08:00:00.000Z'),
            endAt: new Date('2026-07-01T10:00:00.000Z'),
            energyAddedKwh: 5,
          }),
          nativeSession({
            id: 'b',
            dimoSegmentId: 'same-provider',
            segmentFingerprint: 'fp-b',
            startAt: new Date('2026-07-02T08:00:00.000Z'),
            endAt: new Date('2026-07-02T10:00:00.000Z'),
            energyAddedKwh: 7,
          }),
        ],
      }),
    );
    const seg0 = report.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_0');
    expect(seg0?.compositionStatus).toBe('SOURCE_CONFLICT');
  });

  it('produces deterministic fingerprints for identical evidence', () => {
    const loaded = baseLoaded({
      chargeSessions: [
        nativeSession({
          id: 's1',
          startAt: new Date('2026-07-01T08:00:00.000Z'),
          endAt: new Date('2026-07-01T10:00:00.000Z'),
          energyAddedKwh: 11,
        }),
      ],
    });
    const a = buildReport(loaded);
    const b = buildReport(loaded);
    expect(a.segments[0]?.sourceFingerprint).toBe(b.segments[0]?.sourceFingerprint);
  });

  it('recomputes segments when late replacement GT becomes knowable', () => {
    const replacementAt = new Date('2026-06-01T00:00:00.000Z');
    const sessions = [
      nativeSession({
        id: 'pre',
        startAt: new Date('2026-05-01T08:00:00.000Z'),
        endAt: new Date('2026-05-01T10:00:00.000Z'),
        energyAddedKwh: 12,
      }),
      nativeSession({
        id: 'post',
        startAt: new Date('2026-07-01T08:00:00.000Z'),
        endAt: new Date('2026-07-01T10:00:00.000Z'),
        energyAddedKwh: 18,
      }),
    ];
    const beforeGt = buildReport(
      baseLoaded({
        evaluationAt: new Date('2026-09-01T00:00:00.000Z'),
        chargeSessions: sessions,
      }),
    );
    expect(beforeGt.segments).toHaveLength(1);
    expect(beforeGt.segments[0]?.boundedObservedChargeThroughputKwh).toBe(30);

    const afterGt = buildReport(
      baseLoaded({
        evaluationAt: new Date('2026-09-01T00:00:00.000Z'),
        groundTruthEvents: [
          {
            id: 'gt-late',
            batteryScope: BatteryEvidenceScope.HV,
            groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
            effectiveAt: replacementAt,
            createdAt: new Date('2026-08-01T00:00:00.000Z'),
            verificationStatus: 'CONFIRMED',
            revocations: [],
            supersededByGroundTruthEvents: [],
          },
        ],
        chargeSessions: sessions,
      }),
    );
    expect(afterGt.segments).toHaveLength(2);
    expect(
      afterGt.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_0')
        ?.boundedObservedChargeThroughputKwh,
    ).toBe(12);
    expect(
      afterGt.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_1')
        ?.boundedObservedChargeThroughputKwh,
    ).toBe(18);

    const historical = buildReport(
      baseLoaded({
        evaluationAt: new Date('2026-07-15T00:00:00.000Z'),
        groundTruthEvents: [
          {
            id: 'gt-late',
            batteryScope: BatteryEvidenceScope.HV,
            groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
            effectiveAt: replacementAt,
            createdAt: new Date('2026-08-01T00:00:00.000Z'),
            verificationStatus: 'CONFIRMED',
            revocations: [],
            supersededByGroundTruthEvents: [],
          },
        ],
        chargeSessions: sessions,
      }),
    );
    expect(historical.segments).toHaveLength(1);
    expect(historical.segments[0]?.boundedObservedChargeThroughputKwh).toBe(30);
  });
});

describe('M3.3-HV-H4-A2 overlap helpers', () => {
  it('detects strict overlap', () => {
    const sessions = [
      {
        startAt: new Date('2026-07-01T08:00:00.000Z'),
        endAt: new Date('2026-07-01T12:00:00.000Z'),
      },
      {
        startAt: new Date('2026-07-01T11:00:00.000Z'),
        endAt: new Date('2026-07-01T13:00:00.000Z'),
      },
    ] as M3_3HvH4LoadedDataV1['chargeSessions'];
    expect(detectOverlappingEligibleNativeSessions(sessions)).toBe(true);
  });
});
