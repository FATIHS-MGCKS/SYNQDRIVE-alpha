import { BatteryEvidenceScope, BatteryGroundTruthType } from '@prisma/client';
import {
  buildM3_3HvH4ChargeThroughputReportV1,
  validateM3_3HvH4ChargeThroughputReportContract,
} from './m3-3-hv-h4-charge-throughput-report.builder';
import {
  detectOverlappingEligibleNativeSessions,
  detectDuplicateProviderSegmentIdentity,
  extractNativeProviderSegmentId,
  hvChargeSessionsStrictlyOverlap,
} from './m3-3-hv-h4-charge-throughput-session.v1';
import { neumaierCompensatedSumV1 } from './m3-3-hv-h4-charge-throughput-numeric.v1';
import { buildM3_3HvH4CoverageReportV1 } from './m3-3-hv-h4-coverage-report.builder';
import {
  M3_3_HV_H4_BOUNDED_CHARGE_THROUGHPUT_V1,
  M3_3_HV_H4_CHARGE_THROUGHPUT_SUMMATION_METHOD,
  M3_3_HV_H4_DEFAULT_RETENTION_DAYS,
  M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
  M3_3_HV_H4_NON_POSITIVE_ENERGY_POLICY,
  M3_3_HV_H4_SESSION_KNOWLEDGE_ASOF_POLICY,
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
    segmentFingerprint: `fp-${partial.id}`,
    dimoSegmentId: `dimo-${partial.id}`,
    source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
    isOngoing: false,
    providerObservedAt: partial.endAt,
    receivedAt: partial.endAt,
    metadata: {
      qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
      addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
      providerSegmentId: `provider-${partial.id}`,
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
    expect(report.sessionKnowledgeAsOfPolicy).toBe(M3_3_HV_H4_SESSION_KNOWLEDGE_ASOF_POLICY);
    expect(report.nonPositiveEnergyPolicy).toBe(M3_3_HV_H4_NON_POSITIVE_ENERGY_POLICY);
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

  it('fail-closes on duplicate metadata.providerSegmentId across distinct sessions', () => {
    const sharedProvider = 'dimo-provider-segment-42';
    const report = buildReport(
      baseLoaded({
        chargeSessions: [
          nativeSession({
            id: 'a',
            dimoSegmentId: 'fp-canonical-a',
            segmentFingerprint: 'fp-a',
            startAt: new Date('2026-07-01T08:00:00.000Z'),
            endAt: new Date('2026-07-01T10:00:00.000Z'),
            energyAddedKwh: 5,
            metadata: {
              qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
              addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
              providerSegmentId: sharedProvider,
            },
          }),
          nativeSession({
            id: 'b',
            dimoSegmentId: 'fp-canonical-b',
            segmentFingerprint: 'fp-b',
            startAt: new Date('2026-07-02T08:00:00.000Z'),
            endAt: new Date('2026-07-02T10:00:00.000Z'),
            energyAddedKwh: 7,
            metadata: {
              qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
              addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
              providerSegmentId: sharedProvider,
            },
          }),
        ],
      }),
    );
    const seg0 = report.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_0');
    expect(seg0?.compositionStatus).toBe('SOURCE_CONFLICT');
    expect(seg0?.boundedObservedChargeThroughputKwh).toBeNull();
    expect(seg0?.reasonCodes).toContain('DUPLICATE_NATIVE_PROVIDER_SEGMENT_ID');
    expect(seg0?.withheldContributorSessionCount).toBe(2);
  });

  it('does not treat matching dimoSegmentId as provider identity when providerSegmentId is absent', () => {
    const sessions = [
      nativeSession({
        id: 'a',
        dimoSegmentId: 'same-canonical-fingerprint-field',
        segmentFingerprint: 'fp-a',
        startAt: new Date('2026-07-01T08:00:00.000Z'),
        endAt: new Date('2026-07-01T10:00:00.000Z'),
        energyAddedKwh: 5,
        metadata: {
          qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
          addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
        },
      }),
      nativeSession({
        id: 'b',
        dimoSegmentId: 'same-canonical-fingerprint-field',
        segmentFingerprint: 'fp-b',
        startAt: new Date('2026-07-02T08:00:00.000Z'),
        endAt: new Date('2026-07-02T10:00:00.000Z'),
        energyAddedKwh: 7,
        metadata: {
          qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
          addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
        },
      }),
    ];
    expect(detectDuplicateProviderSegmentIdentity(sessions)).toBe(false);
    const report = buildReport(baseLoaded({ chargeSessions: sessions }));
    const seg0 = report.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_0');
    expect(seg0?.compositionStatus).toBe('AVAILABLE_OBSERVED_GAP_AWARE');
    expect(seg0?.boundedObservedChargeThroughputKwh).toBe(12);
  });

  it('does not false-collide on null providerSegmentId alone', () => {
    const a = nativeSession({
      id: 'a',
      startAt: new Date('2026-07-01T08:00:00.000Z'),
      endAt: new Date('2026-07-01T10:00:00.000Z'),
      energyAddedKwh: 3,
      metadata: {
        qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
        addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
        providerSegmentId: null,
      },
    });
    const b = nativeSession({
      id: 'b',
      startAt: new Date('2026-07-02T08:00:00.000Z'),
      endAt: new Date('2026-07-02T10:00:00.000Z'),
      energyAddedKwh: 4,
      metadata: {
        qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
        addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
      },
    });
    expect(extractNativeProviderSegmentId(a)).toBeNull();
    expect(detectDuplicateProviderSegmentIdentity([a, b])).toBe(false);
  });

  it('excludes sessions whose durable row postdates evaluationAt (knowledge-as-of)', () => {
    const evaluationAt = new Date('2026-08-01T00:00:00.000Z');
    const knowable = nativeSession({
      id: 'ok',
      startAt: new Date('2026-07-01T08:00:00.000Z'),
      endAt: new Date('2026-07-01T10:00:00.000Z'),
      energyAddedKwh: 9,
      createdAt: new Date('2026-07-01T09:00:00.000Z'),
      receivedAt: new Date('2026-07-01T09:00:00.000Z'),
      updatedAt: new Date('2026-07-01T09:00:00.000Z'),
    });
    const createdLate = nativeSession({
      id: 'late-create',
      startAt: new Date('2026-07-05T08:00:00.000Z'),
      endAt: new Date('2026-07-05T10:00:00.000Z'),
      energyAddedKwh: 11,
      createdAt: new Date('2026-08-02T00:00:00.000Z'),
      receivedAt: new Date('2026-07-05T10:00:00.000Z'),
      updatedAt: new Date('2026-07-05T10:00:00.000Z'),
    });
    const updatedLate = nativeSession({
      id: 'late-update',
      startAt: new Date('2026-07-10T08:00:00.000Z'),
      endAt: new Date('2026-07-10T10:00:00.000Z'),
      energyAddedKwh: 13,
      createdAt: new Date('2026-07-10T09:00:00.000Z'),
      receivedAt: new Date('2026-07-10T09:00:00.000Z'),
      updatedAt: new Date('2026-08-02T00:00:00.000Z'),
    });
    const report = buildReport(
      baseLoaded({
        evaluationAt,
        chargeSessions: [knowable, createdLate, updatedLate],
      }),
    );
    const seg0 = report.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_0');
    expect(seg0?.compositionStatus).toBe('AVAILABLE_OBSERVED_GAP_AWARE');
    expect(seg0?.boundedObservedChargeThroughputKwh).toBe(9);
    expect(
      report.sessionClassifications.find((c) => c.sessionId === 'late-create')
        ?.contributionEligibility,
    ).toBe('INELIGIBLE_NOT_KNOWABLE_AT_EVALUATION');
    expect(
      report.sessionClassifications.find((c) => c.sessionId === 'late-update')
        ?.contributionEligibility,
    ).toBe('INELIGIBLE_NOT_KNOWABLE_AT_EVALUATION');
  });

  it('uses Neumaier compensated summation (not naive float reduce)', () => {
    const values = [1e16, 1, 1, 1];
    const naive = values.reduce((s, v) => s + v, 0);
    const compensated = neumaierCompensatedSumV1(values);
    expect(compensated).not.toBe(naive);
    expect(compensated).toBe(1e16 + 4);

    const loaded = baseLoaded({
      chargeSessions: values.map((energyAddedKwh, i) =>
        nativeSession({
          id: `n-${i}`,
          startAt: new Date(`2026-07-0${i + 1}T08:00:00.000Z`),
          endAt: new Date(`2026-07-0${i + 1}T10:00:00.000Z`),
          energyAddedKwh,
        }),
      ),
    });
    const report = buildReport(loaded);
    const seg0 = report.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_0');
    expect(seg0?.summationMethod).toBe(M3_3_HV_H4_CHARGE_THROUGHPUT_SUMMATION_METHOD);
    expect(seg0?.boundedObservedChargeThroughputKwh).toBe(compensated);
  });

  it('implements NEUMAIER_COMPENSATED_SUM_V1 with ordering distinct from Kahan-style sum', () => {
    function kahanStyleCompensatedSumForRegression(values: readonly number[]): number {
      let sum = 0;
      let compensation = 0;
      for (const value of values) {
        const corrected = value - compensation;
        const next = sum + corrected;
        compensation = next - sum - corrected;
        sum = next;
      }
      return sum;
    }

    const values = [1, 1e16, 1] as const;
    const naive = values.reduce((s, v) => s + v, 0);
    const kahanStyle = kahanStyleCompensatedSumForRegression(values);
    const neumaier = neumaierCompensatedSumV1(values);
    const expectedNeumaier = 1e16 + 2;

    expect(naive).toBe(1e16);
    expect(kahanStyle).toBe(1e16);
    expect(neumaier).toBe(expectedNeumaier);
    expect(kahanStyle).not.toBe(neumaier);
    expect(neumaier).not.toBe(naive);
  });

  it('fingerprints diverge across composition status and conflict evidence', () => {
    const baseSessions = [
      nativeSession({
        id: 's1',
        startAt: new Date('2026-07-01T08:00:00.000Z'),
        endAt: new Date('2026-07-01T10:00:00.000Z'),
        energyAddedKwh: 11,
      }),
    ];
    const available = buildReport(baseLoaded({ chargeSessions: baseSessions }));
    const truncated = buildReport(
      baseLoaded({
        chargeSessions: baseSessions,
        chargeSessionSourceLoad: {
          loadedCount: 5000,
          hardLimit: 5000,
          sourceTruncated: true,
          hardLimitReached: true,
        },
      }),
    );
    const conflict = buildReport(
      baseLoaded({
        chargeSessions: [
          nativeSession({
            id: 'a',
            startAt: new Date('2026-07-01T08:00:00.000Z'),
            endAt: new Date('2026-07-01T12:00:00.000Z'),
            energyAddedKwh: 10,
            metadata: {
              qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
              addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
              providerSegmentId: 'p-dup',
            },
          }),
          nativeSession({
            id: 'b',
            startAt: new Date('2026-07-02T08:00:00.000Z'),
            endAt: new Date('2026-07-02T10:00:00.000Z'),
            energyAddedKwh: 12,
            metadata: {
              qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
              addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
              providerSegmentId: 'p-dup',
            },
          }),
        ],
      }),
    );
    const fpAvailable = available.segments[0]?.sourceFingerprint;
    const fpTruncated = truncated.segments[0]?.sourceFingerprint;
    const fpConflict = conflict.segments[0]?.sourceFingerprint;
    expect(fpAvailable).toBeDefined();
    expect(fpTruncated).not.toBe(fpAvailable);
    expect(fpConflict).not.toBe(fpAvailable);

    const energyBump = buildReport(
      baseLoaded({
        chargeSessions: [
          nativeSession({
            id: 's1',
            startAt: new Date('2026-07-01T08:00:00.000Z'),
            endAt: new Date('2026-07-01T10:00:00.000Z'),
            energyAddedKwh: 12,
          }),
        ],
      }),
    );
    expect(energyBump.segments[0]?.sourceFingerprint).not.toBe(fpAvailable);
  });

  it('legacy dimoSegmentId-only duplicate seed is not provider authority (superseded by metadata test)', () => {
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
            metadata: {
              qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
              addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
              providerSegmentId: 'unique-a',
            },
          }),
          nativeSession({
            id: 'b',
            dimoSegmentId: 'same-provider',
            segmentFingerprint: 'fp-b',
            startAt: new Date('2026-07-02T08:00:00.000Z'),
            endAt: new Date('2026-07-02T10:00:00.000Z'),
            energyAddedKwh: 7,
            metadata: {
              qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
              addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
              providerSegmentId: 'unique-b',
            },
          }),
        ],
      }),
    );
    const seg0 = report.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_0');
    expect(seg0?.compositionStatus).toBe('AVAILABLE_OBSERVED_GAP_AWARE');
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
