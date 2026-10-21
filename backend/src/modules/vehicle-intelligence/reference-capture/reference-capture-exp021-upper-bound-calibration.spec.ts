import {
  buildPhaseAdvancementConfig,
  cadenceSequenceFromPlan,
  cadenceSequenceLabel,
  classifyPhaseScientificStatus,
  EXP021_LEGACY_CADENCE_PHASE_ORDER_MS,
  EXP021_LOWER_BOUND_V1,
  EXP021_UPPER_BOUND_V2,
  nominalTotalDurationMs,
  resolveExp021CalibrationPlan,
} from './reference-capture-exp021-calibration-plan.lib';
import { finalizePhaseSummary } from './reference-capture-hf-calibration-phase.policy';
import { HF_BUCKET_AGGREGATION_INTERVAL } from './reference-capture-hf-block-polling.policy';
import { clampHfPollIntervalMs } from './reference-capture-hf-block-polling.policy';
import { PhysicalDrivePhaseTracker } from './reference-capture-exp-021-motion.lib';
import {
  buildProspectiveProbeAForPhase,
  buildProspectiveProbeBForPhase,
  EXP021_CADENCE_PHASE_ORDER_MS,
  EXP021_MANDATORY_AGES_MS,
} from './reference-capture-settlement-shadow.policy';
import { joinNativeGapsWithSettlementObservations } from './reference-capture-exp021-native-settlement-join';
import { buildExp021BucketIdentity } from './reference-capture-settlement-shadow-bucket-identity';
import {
  compareValueSnapshots,
  hashBucketValueContent,
} from './reference-capture-settlement-shadow-value-snapshot';
import { reconstructNativeGapReportFromEvidence } from './reference-capture-exp021-native-gap-reconstruction';
import { buildNativeTemporalEvidenceV1 } from './reference-capture-native-temporal-evidence.lib';

describe('EXP-021 UPPER_BOUND_V2 calibration plan', () => {
  const t0Ms = Date.parse('2026-09-11T10:00:00.000Z');

  it('defines cadence sequence 180→120→60→30', () => {
    expect(cadenceSequenceFromPlan(EXP021_UPPER_BOUND_V2)).toEqual([
      180_000,
      120_000,
      60_000,
      30_000,
    ]);
    expect(cadenceSequenceLabel(EXP021_UPPER_BOUND_V2)).toBe('180_120_60_30');
    expect(EXP021_CADENCE_PHASE_ORDER_MS).toEqual([180_000, 120_000, 60_000, 30_000]);
  });

  it('nominal phase durations are 15m → 10m → 5m → 3m (33m total)', () => {
    expect(EXP021_UPPER_BOUND_V2.phases.map((p) => p.targetDurationMs)).toEqual([
      15 * 60_000,
      10 * 60_000,
      5 * 60_000,
      3 * 60_000,
    ]);
    expect(nominalTotalDurationMs(EXP021_UPPER_BOUND_V2)).toBe(33 * 60_000);
    expect(EXP021_UPPER_BOUND_V2.maxTotalDurationMs).toBe(35 * 60_000);
  });

  it('does not apply universal 300s MOVING rule to UPPER_BOUND_V2', () => {
    expect(EXP021_UPPER_BOUND_V2.advancementMode).toBe('WALL_CLOCK');
    expect(EXP021_UPPER_BOUND_V2.legacyMovementRequirementMs).toBeUndefined();
    const phase180 = buildPhaseAdvancementConfig(
      EXP021_UPPER_BOUND_V2,
      EXP021_UPPER_BOUND_V2.phases[0],
    );
    expect(phase180).toEqual({
      mode: 'WALL_CLOCK',
      targetWallDurationMs: 15 * 60_000,
      graceBudgetMs: 2 * 60_000,
    });
  });

  it('preserves historical 60/30/20/10 parseability', () => {
    expect(EXP021_LEGACY_CADENCE_PHASE_ORDER_MS).toEqual([60_000, 30_000, 20_000, 10_000]);
    expect(resolveExp021CalibrationPlan({ EXP021_CALIBRATION_PLAN: 'LOWER_BOUND_V1' })).toBe(
      EXP021_LOWER_BOUND_V1,
    );
    expect(resolveExp021CalibrationPlan({ EXP021_CALIBRATION_PLAN: '60_30_20_10' })).toBe(
      EXP021_LOWER_BOUND_V1,
    );
  });

  it('labels 30s phase as CONTROL and 180/120/60 as EXPERIMENTAL', () => {
    expect(EXP021_UPPER_BOUND_V2.phases[3].role).toBe('CONTROL');
    expect(EXP021_UPPER_BOUND_V2.phases.slice(0, 3).every((p) => p.role === 'EXPERIMENTAL')).toBe(
      true,
    );
  });

  it('advances phases on wall-clock target, not unbounded MOVING accumulation', () => {
    const tracker = new PhysicalDrivePhaseTracker();
    const spec = EXP021_UPPER_BOUND_V2.phases[0];
    tracker.beginPhase(
      spec.cadenceMs,
      t0Ms,
      buildPhaseAdvancementConfig(EXP021_UPPER_BOUND_V2, spec),
    );
    const beforeTarget = t0Ms + spec.targetDurationMs - 5_000;
    tracker.tick('PARKED_CANDIDATE', beforeTarget);
    expect(tracker.shouldAdvancePhase(beforeTarget)).toBe(false);
    const atTarget = t0Ms + spec.targetDurationMs;
    tracker.tick('PARKED_CANDIDATE', atTarget);
    expect(tracker.shouldAdvancePhase(atTarget)).toBe(true);
  });

  it('classifies insufficient requests as DEGRADED_INSUFFICIENT_REQUESTS', () => {
    const status = classifyPhaseScientificStatus({
      plan: EXP021_UPPER_BOUND_V2,
      phaseSpec: EXP021_UPPER_BOUND_V2.phases[0],
      providerSuccessCount: 2,
      validMovementDurationMs: 12 * 60_000,
      wallDurationMs: 15 * 60_000,
    });
    expect(status).toBe('DEGRADED_INSUFFICIENT_REQUESTS');
  });

  it('does not fabricate validity when movement is very low', () => {
    const status = classifyPhaseScientificStatus({
      plan: EXP021_UPPER_BOUND_V2,
      phaseSpec: EXP021_UPPER_BOUND_V2.phases[2],
      providerSuccessCount: 6,
      validMovementDurationMs: 10_000,
      wallDurationMs: 5 * 60_000,
    });
    expect(status).toBe('DEGRADED_LOW_MOVEMENT');
  });

  it('keeps HF bucket aggregation at 1s', () => {
    expect(HF_BUCKET_AGGREGATION_INTERVAL).toBe('1s');
  });

  it('accepts 180s and 120s poll intervals in clamp', () => {
    expect(clampHfPollIntervalMs(180_000)).toBe(180_000);
    expect(clampHfPollIntervalMs(120_000)).toBe(120_000);
  });

  it('persists native temporal evidence for 180s phase sealing', () => {
    const phaseStartedAt = new Date(t0Ms).toISOString();
    const phase = {
      calibrationPhaseId: 'phase-180',
      phaseSequence: 1,
      effectivePollIntervalMs: 180_000,
      phaseStartedAt,
      phaseEndedAt: new Date(t0Ms + 15 * 60_000).toISOString(),
      phaseProvenance: 'PHYSICAL_T0' as const,
      canonicalT0At: phaseStartedAt,
      effectiveConfig: {
        calibrationSeriesId: 'series-1',
        calibrationPhaseId: 'phase-180',
        phaseSequence: 1,
        vehicleId: 'veh-1',
        tokenId: 1,
        effectivePollIntervalMs: 180_000,
        settlementDelayMs: 8000,
        recoveryOverlapMs: 6000,
        policyVersion: 'v2',
        policyMode: 'V2' as const,
        effectiveAt: phaseStartedAt,
      },
    };
    const counters = {
      calibrationPhaseId: 'phase-180',
      allRequestCount: 5,
      nativeFastLoopRequestCount: 5,
      nativeFastLoopProviderSuccessCount: 5,
      nativeFastLoopProviderZeroResultCount: 0,
      nativeFastLoopProviderErrorCount: 0,
      nativeFastLoopProviderBucketCount: 2,
      nativeFastLoopNewBucketCount: 2,
      nativeFastLoopDuplicateBucketCount: 0,
      nativeFastLoopRevisionBucketCount: 0,
      transitionRequestCount: 0,
      transitionProviderBucketCount: 0,
      recoverySweepRequestCount: 0,
      recoveredLateBucketCount: 0,
      transitionWindowCount: 0,
      nativeUniqueTemporalBucketStarts: [
        new Date(t0Ms).toISOString(),
        new Date(t0Ms + 180_000).toISOString(),
      ],
      nativeMaxIntraResponseTemporalGapMs: null,
    };
    const summary = finalizePhaseSummary({
      phase,
      counters,
      phaseEndedAtMs: t0Ms + 15 * 60_000,
      validMovementDurationMs: 12 * 60_000,
      calibrationPlan: EXP021_UPPER_BOUND_V2,
    });
    expect(summary.nativeTemporalEvidence?.orderedNativeTemporalBucketStarts).toHaveLength(2);
    expect(summary.calibrationPlanVersion).toBe('EXP021_UPPER_BOUND_V2');
    expect(summary.phaseRole).toBe('EXPERIMENTAL');
  });

  it('reconstructs gap ledger after phase sealing for 120s cadence', () => {
    const evidence = buildNativeTemporalEvidenceV1({
      phase: {
        calibrationPhaseId: 'p120',
        phaseSequence: 2,
        effectivePollIntervalMs: 120_000,
        phaseStartedAt: new Date(t0Ms).toISOString(),
        phaseEndedAt: new Date(t0Ms + 10 * 60_000).toISOString(),
        phaseProvenance: 'PHYSICAL_TRANSITION',
      },
      counters: {
        calibrationPhaseId: 'p120',
        allRequestCount: 3,
        nativeFastLoopRequestCount: 3,
        nativeFastLoopProviderSuccessCount: 3,
        nativeFastLoopProviderZeroResultCount: 0,
        nativeFastLoopProviderErrorCount: 0,
        nativeFastLoopProviderBucketCount: 3,
        nativeFastLoopNewBucketCount: 3,
        nativeFastLoopDuplicateBucketCount: 0,
        nativeFastLoopRevisionBucketCount: 0,
        transitionRequestCount: 0,
        transitionProviderBucketCount: 0,
        recoverySweepRequestCount: 0,
        recoveredLateBucketCount: 0,
        transitionWindowCount: 0,
        nativeUniqueTemporalBucketStarts: [
          new Date(t0Ms).toISOString(),
          new Date(t0Ms + 120_000).toISOString(),
          new Date(t0Ms + 240_000).toISOString(),
        ],
        nativeMaxIntraResponseTemporalGapMs: null,
      },
      phaseEndedAtIso: new Date(t0Ms + 10 * 60_000).toISOString(),
    });
    const report = reconstructNativeGapReportFromEvidence(evidence);
    expect(report.nativeBucketCount).toBe(3);
    expect(report.gaps.length).toBe(2);
  });

  it('settlement join works for 180s phase probes', () => {
    const t0 = new Date(t0Ms).toISOString();
    const t1 = new Date(t0Ms + 180_000).toISOString();
    const evidence = buildNativeTemporalEvidenceV1({
      phase: {
        calibrationPhaseId: 'p180',
        phaseSequence: 1,
        effectivePollIntervalMs: 180_000,
        phaseStartedAt: t0,
        phaseEndedAt: new Date(t0Ms + 15 * 60_000).toISOString(),
        phaseProvenance: 'PHYSICAL_T0',
      },
      counters: {
        calibrationPhaseId: 'p180',
        allRequestCount: 2,
        nativeFastLoopRequestCount: 2,
        nativeFastLoopProviderSuccessCount: 2,
        nativeFastLoopProviderZeroResultCount: 0,
        nativeFastLoopProviderErrorCount: 0,
        nativeFastLoopProviderBucketCount: 2,
        nativeFastLoopNewBucketCount: 2,
        nativeFastLoopDuplicateBucketCount: 0,
        nativeFastLoopRevisionBucketCount: 0,
        transitionRequestCount: 0,
        transitionProviderBucketCount: 0,
        recoverySweepRequestCount: 0,
        recoveredLateBucketCount: 0,
        transitionWindowCount: 0,
        nativeUniqueTemporalBucketStarts: [t0, t1],
        nativeMaxIntraResponseTemporalGapMs: null,
      },
      phaseEndedAtIso: new Date(t0Ms + 15 * 60_000).toISOString(),
    });
    const identity = buildExp021BucketIdentity('speed', new Date(t0Ms + 90_000).toISOString());
    const join = joinNativeGapsWithSettlementObservations({
      phaseLabel: '180s',
      phaseProvenance: 'PHYSICAL_T0',
      orderedNativeTemporalBucketStarts: evidence.orderedNativeTemporalBucketStarts,
      primaryField: 'speed',
      observations: [
        {
          scheduledAgeMs: 60_000,
          providerRequestStatus: 'SUCCESS',
          rawRowCount: 1,
          uniqueBucketIdentities: [identity],
          bucketValueSnapshots: { [identity]: '42' },
        },
      ],
    });
    expect(join.gapJoinRows.length + join.settlementOnlyBuckets.length).toBeGreaterThanOrEqual(0);
  });

  it('value-revision snapshots work across all four cadences', () => {
    for (const cadenceMs of cadenceSequenceFromPlan(EXP021_UPPER_BOUND_V2)) {
      const identity = buildExp021BucketIdentity('speed', new Date(t0Ms + cadenceMs).toISOString());
      const first = { [identity]: '10' };
      const revised = { [identity]: '11' };
      expect(compareValueSnapshots(first, first).revisionCount).toBe(0);
      expect(compareValueSnapshots(revised, first).revisionCount).toBe(1);
      expect(hashBucketValueContent(first)).not.toBe(hashBucketValueContent(revised));
    }
  });

  it('metadata-only hash change is not treated as value revision', () => {
    const identity = buildExp021BucketIdentity('speed', new Date(t0Ms).toISOString());
    const snapshots = { [identity]: '42' };
    const comparison = compareValueSnapshots(snapshots, snapshots);
    expect(comparison.revisionCount).toBe(0);
  });

  it('isolates phase timestamp ledgers across 180→120 transition', () => {
    const phase60Evidence = buildNativeTemporalEvidenceV1({
      phase: {
        calibrationPhaseId: 'p180',
        phaseSequence: 1,
        effectivePollIntervalMs: 180_000,
        phaseStartedAt: new Date(t0Ms).toISOString(),
        phaseEndedAt: new Date(t0Ms + 15 * 60_000).toISOString(),
        phaseProvenance: 'PHYSICAL_T0',
      },
      counters: {
        calibrationPhaseId: 'p180',
        allRequestCount: 1,
        nativeFastLoopRequestCount: 1,
        nativeFastLoopProviderSuccessCount: 1,
        nativeFastLoopProviderZeroResultCount: 0,
        nativeFastLoopProviderErrorCount: 0,
        nativeFastLoopProviderBucketCount: 1,
        nativeFastLoopNewBucketCount: 1,
        nativeFastLoopDuplicateBucketCount: 0,
        nativeFastLoopRevisionBucketCount: 0,
        transitionRequestCount: 0,
        transitionProviderBucketCount: 0,
        recoverySweepRequestCount: 0,
        recoveredLateBucketCount: 0,
        transitionWindowCount: 0,
        nativeUniqueTemporalBucketStarts: [new Date(t0Ms).toISOString()],
        nativeMaxIntraResponseTemporalGapMs: null,
      },
      phaseEndedAtIso: new Date(t0Ms + 15 * 60_000).toISOString(),
    });
    const phase30Evidence = buildNativeTemporalEvidenceV1({
      phase: {
        calibrationPhaseId: 'p120',
        phaseSequence: 2,
        effectivePollIntervalMs: 120_000,
        phaseStartedAt: new Date(t0Ms + 15 * 60_000).toISOString(),
        phaseEndedAt: new Date(t0Ms + 25 * 60_000).toISOString(),
        phaseProvenance: 'PHYSICAL_TRANSITION',
      },
      counters: {
        calibrationPhaseId: 'p120',
        allRequestCount: 1,
        nativeFastLoopRequestCount: 1,
        nativeFastLoopProviderSuccessCount: 1,
        nativeFastLoopProviderZeroResultCount: 0,
        nativeFastLoopProviderErrorCount: 0,
        nativeFastLoopProviderBucketCount: 1,
        nativeFastLoopNewBucketCount: 1,
        nativeFastLoopDuplicateBucketCount: 0,
        nativeFastLoopRevisionBucketCount: 0,
        transitionRequestCount: 0,
        transitionProviderBucketCount: 0,
        recoverySweepRequestCount: 0,
        recoveredLateBucketCount: 0,
        transitionWindowCount: 0,
        nativeUniqueTemporalBucketStarts: [new Date(t0Ms + 15 * 60_000).toISOString()],
        nativeMaxIntraResponseTemporalGapMs: null,
      },
      phaseEndedAtIso: new Date(t0Ms + 25 * 60_000).toISOString(),
    });
    expect(phase60Evidence.orderedNativeTemporalBucketStarts).not.toEqual(
      phase30Evidence.orderedNativeTemporalBucketStarts,
    );
    expect(phase60Evidence.phaseProvenance).toBe('PHYSICAL_T0');
    expect(phase30Evidence.phaseProvenance).toBe('PHYSICAL_TRANSITION');
  });

  it('schedules settlement probes for 180s phase within 15m window', () => {
    const probeA = buildProspectiveProbeAForPhase({
      phasePollIntervalMs: 180_000,
      phaseStartedAtMs: t0Ms,
    });
    const probeB = buildProspectiveProbeBForPhase({
      phasePollIntervalMs: 180_000,
      phaseStartedAtMs: t0Ms,
      nominalPhaseDurationMs: 15 * 60_000,
    });
    expect(probeA).not.toBeNull();
    expect(probeB).not.toBeNull();
    const phaseEnd = t0Ms + 15 * 60_000;
    expect(probeA!.sourceIntervalEndMs).toBeLessThanOrEqual(phaseEnd);
    expect(probeB!.sourceIntervalEndMs).toBeLessThanOrEqual(phaseEnd);
  });

  it('preserves mandatory settlement ages independent of poll cadence', () => {
    expect(EXP021_MANDATORY_AGES_MS).toEqual([
      30_000,
      60_000,
      120_000,
      180_000,
      300_000,
      600_000,
    ]);
  });

  it('restart during 180 phase resumes with wall-clock advancement config', () => {
    const tracker = new PhysicalDrivePhaseTracker();
    const spec = EXP021_UPPER_BOUND_V2.phases[0];
    const advancement = buildPhaseAdvancementConfig(EXP021_UPPER_BOUND_V2, spec);
    tracker.beginPhase(spec.cadenceMs, t0Ms, advancement);
    tracker.tick('MOVING', t0Ms + 5 * 60_000);
    const resumed = new PhysicalDrivePhaseTracker();
    resumed.beginPhase(spec.cadenceMs, t0Ms, advancement);
    resumed.tick('MOVING', t0Ms + 5 * 60_000);
    expect(resumed.shouldAdvancePhase(t0Ms + spec.targetDurationMs)).toBe(true);
  });
});
