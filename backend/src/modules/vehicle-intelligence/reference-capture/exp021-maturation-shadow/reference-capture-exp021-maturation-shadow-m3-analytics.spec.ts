import { Exp021MaturationShadowProviderOutcomeClass, Exp021MaturationShadowSignalLane } from '@prisma/client';
import { CANONICAL_EXP021_BUCKET_IDENTITY } from '../reference-capture-settlement-shadow-bucket-identity';
import { analyzeExp021MaturationShadowM3 } from './reference-capture-exp021-maturation-shadow-m3-analyzer.lib';
import { reconstructBucketLociFromAttempt } from './reference-capture-exp021-maturation-shadow-m3-bucket-locus.lib';
import { Exp021MaturationShadowM3BucketLocusError } from './reference-capture-exp021-maturation-shadow-m3.errors';
import {
  serializeM3AnalysisJson,
  serializeM3PairedGeometryCsv,
  serializeM3TransitionsCsv,
} from './reference-capture-exp021-maturation-shadow-m3-export.lib';
import { analyzeStratum, computePerFieldMaturation } from './reference-capture-exp021-maturation-shadow-m3-stratum-analysis.lib';
import { medianP25P75, wilsonScoreInterval } from './reference-capture-exp021-maturation-shadow-m3-statistics.lib';
import type {
  Exp021MaturationShadowM3AttemptInput,
  Exp021MaturationShadowM3FamilyInput,
  Exp021MaturationShadowM3StratumInput,
} from './reference-capture-exp021-maturation-shadow-m3.types';

const WINDOW_TO = new Date('2026-09-16T12:00:00.000Z');

function attempt(partial: Partial<Exp021MaturationShadowM3AttemptInput> & Pick<Exp021MaturationShadowM3AttemptInput, 'id' | 'actualAgeMs' | 'providerOutcomeClass'>): Exp021MaturationShadowM3AttemptInput {
  const succeeded = partial.providerOutcomeClass !== Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR;
  const manifest = partial.bucketLocusManifestJson ?? (succeeded ? ['speed|2026-09-16T11:59:30.000Z'] : []);
  const uniqueCount =
    partial.uniqueBucketLocusCount ??
    (partial.providerOutcomeClass === Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO
      ? 0
      : partial.providerOutcomeClass === Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR
        ? null
        : 1);

  return {
    observationSlotId: partial.observationSlotId ?? 'slot-1',
    attemptOrdinal: partial.attemptOrdinal ?? 1,
    plannedAgeMs: partial.plannedAgeMs ?? partial.actualAgeMs,
    schedulerDriftMs: partial.schedulerDriftMs ?? partial.actualAgeMs - (partial.plannedAgeMs ?? partial.actualAgeMs),
    providerRequestSucceeded: partial.providerRequestSucceeded ?? succeeded,
    providerStatus: partial.providerStatus ?? (succeeded ? 'OK' : 'ERROR'),
    providerErrorClass: partial.providerErrorClass ?? null,
    perFieldBucketLocusCountJson: partial.perFieldBucketLocusCountJson ?? {},
    bucketLocusIdentityVersion: partial.bucketLocusIdentityVersion ?? CANONICAL_EXP021_BUCKET_IDENTITY,
    payloadRevisionCount: partial.payloadRevisionCount ?? 0,
    changedPayloadLocusCount: partial.changedPayloadLocusCount ?? 0,
    signalSetHash: partial.signalSetHash ?? 'sig-hash',
    querySemanticsHash: partial.querySemanticsHash ?? 'sem-hash',
    runtimeBuildSha: partial.runtimeBuildSha ?? 'runtime-sha',
    uniqueBucketLocusCount: uniqueCount,
    bucketLocusManifestJson: manifest,
    ...partial,
  };
}

function stratum(
  partial: Partial<Exp021MaturationShadowM3StratumInput> & Pick<Exp021MaturationShadowM3StratumInput, 'id' | 'signalLane' | 'queryGeometryMs'>,
  attempts: Exp021MaturationShadowM3AttemptInput[],
): Exp021MaturationShadowM3StratumInput {
  const geometry = partial.queryGeometryMs;
  return {
    windowFamilyId: partial.windowFamilyId ?? 'family-1',
    windowFrom: partial.windowFrom ?? new Date(WINDOW_TO.getTime() - geometry),
    windowTo: partial.windowTo ?? WINDOW_TO,
    signalSetHash: partial.signalSetHash ?? 'sig-hash',
    querySemanticsHash: partial.querySemanticsHash ?? 'sem-hash',
    runtimeBuildShaAtEnrollment: partial.runtimeBuildShaAtEnrollment ?? 'runtime-sha',
    activityClassificationJson: partial.activityClassificationJson ?? { class: 'UNKNOWN_ACTIVITY', geometryMs: geometry },
    ...partial,
    attempts,
  };
}

function family(strata: Exp021MaturationShadowM3StratumInput[]): Exp021MaturationShadowM3FamilyInput {
  return {
    id: 'family-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    tokenId: 123,
    canonicalWindowTo: WINDOW_TO,
    shadowScheduleVersion: 'MATURATION_SHADOW_SCHEDULE_v1',
    plannedAgesMsExact: [30_000, 40_000, 45_000],
    policyDelayProbeMs: 120_000,
    strata,
  };
}

describe('EXP-021 maturation shadow M3 analytics (PR-M3)', () => {
  it('1) zero -> nonzero interval censored transition', () => {
    const f = family([
      stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a1', actualAgeMs: 30_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO, bucketLocusManifestJson: [], uniqueBucketLocusCount: 0 }),
        attempt({ id: 'a2', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO }),
      ]),
    ]);
    const analysis = analyzeStratum(f, f.strata[0]);
    expect(analysis.availabilityTransition.censoringClass).toBe('INTERVAL_CENSORED');
    expect(analysis.availabilityTransition.lowerBoundExclusiveMs).toBe(30_000);
    expect(analysis.availabilityTransition.upperBoundInclusiveMs).toBe(45_000);
  });

  it('2) zero -> provider error -> nonzero does not narrow on error age', () => {
    const f = family([
      stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a1', actualAgeMs: 30_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO, bucketLocusManifestJson: [], uniqueBucketLocusCount: 0 }),
        attempt({ id: 'a2', actualAgeMs: 40_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR, providerRequestSucceeded: false }),
        attempt({ id: 'a3', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO }),
      ]),
    ]);
    const analysis = analyzeStratum(f, f.strata[0]);
    expect(analysis.availabilityTransition.lowerBoundExclusiveMs).toBe(30_000);
    expect(analysis.availabilityTransition.upperBoundInclusiveMs).toBe(45_000);
    expect(analysis.availabilityTransition.providerErrorAgesMs).toEqual([40_000]);
  });

  it('3) provider error before first success is left-censored when later positive exists', () => {
    const f = family([
      stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a1', actualAgeMs: 40_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR, providerRequestSucceeded: false }),
        attempt({ id: 'a2', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO }),
      ]),
    ]);
    const analysis = analyzeStratum(f, f.strata[0]);
    expect(analysis.availabilityTransition.censoringClass).toBe('LEFT_CENSORED');
    expect(analysis.availabilityTransition.lastNegativeAgeMs).toBeNull();
  });

  it('4) all successful zero => right censored', () => {
    const f = family([
      stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a1', actualAgeMs: 30_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO, bucketLocusManifestJson: [], uniqueBucketLocusCount: 0 }),
        attempt({ id: 'a2', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO, bucketLocusManifestJson: [], uniqueBucketLocusCount: 0 }),
      ]),
    ]);
    const analysis = analyzeStratum(f, f.strata[0]);
    expect(analysis.availabilityTransition.censoringClass).toBe('RIGHT_CENSORED');
    expect(analysis.availabilityTransition.firstPositiveAgeMs).toBeNull();
  });

  it('5) all provider errors => no valid provider evidence', () => {
    const f = family([
      stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a1', actualAgeMs: 30_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR, providerRequestSucceeded: false }),
        attempt({ id: 'a2', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR, providerRequestSucceeded: false }),
      ]),
    ]);
    const analysis = analyzeStratum(f, f.strata[0]);
    expect(analysis.availabilityTransition.censoringClass).toBe('NO_VALID_PROVIDER_EVIDENCE');
    expect(analysis.providerQuality.providerErrors).toBe(2);
  });

  it('6) no observations => no valid provider evidence', () => {
    const f = family([stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [])]);
    const analysis = analyzeStratum(f, f.strata[0]);
    expect(analysis.availabilityTransition.censoringClass).toBe('NO_VALID_PROVIDER_EVIDENCE');
    expect(analysis.finalShadowObservedUnionCount).toBe(0);
  });

  it('7) out-of-order actual ages still ordered scientifically', () => {
    const f = family([
      stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a2', actualAgeMs: 50_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO, bucketLocusManifestJson: ['speed|2026-09-16T11:59:40.000Z'] }),
        attempt({ id: 'a1', actualAgeMs: 30_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO, bucketLocusManifestJson: [], uniqueBucketLocusCount: 0 }),
      ]),
    ]);
    const analysis = analyzeStratum(f, f.strata[0]);
    expect(analysis.maturationObservations.map((o) => o.actualAgeMs)).toEqual([30_000, 50_000]);
  });

  it('8) late retry success uses real actualAge not planned age', () => {
    const f = family([
      stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a1', actualAgeMs: 45_300, plannedAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR, providerRequestSucceeded: false }),
        attempt({ id: 'a2', actualAgeMs: 51_000, plannedAgeMs: 45_000, attemptOrdinal: 2, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO }),
      ]),
    ]);
    const analysis = analyzeStratum(f, f.strata[0]);
    expect(analysis.availabilityTransition.firstNonZeroActualAgeMs).toBe(51_000);
    expect(analysis.maturationObservations[0].actualAgeMs).toBe(51_000);
  });

  it('9) duplicate bucket loci deduplicate', () => {
    const reconstruction = reconstructBucketLociFromAttempt({
      bucketLocusManifestJson: ['speed|2026-09-16T11:59:30.000Z', 'speed|2026-09-16T11:59:30.000Z'],
      bucketLocusIdentityVersion: CANONICAL_EXP021_BUCKET_IDENTITY,
      uniqueBucketLocusCount: 1,
    });
    expect(reconstruction.uniqueCount).toBe(1);
  });

  it('10) final union is union across ages not last response only', () => {
    const f = family([
      stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a1', actualAgeMs: 30_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO, bucketLocusManifestJson: ['speed|2026-09-16T11:59:10.000Z'] }),
        attempt({ id: 'a2', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO, bucketLocusManifestJson: ['rpm|2026-09-16T11:59:20.000Z'] }),
      ]),
    ]);
    const analysis = analyzeStratum(f, f.strata[0]);
    expect(analysis.finalShadowObservedUnionCount).toBe(2);
    expect(analysis.finalShadowObservedUnionLoci).toEqual(
      ['rpm|2026-09-16T11:59:20.000Z', 'speed|2026-09-16T11:59:10.000Z'].sort(),
    );
  });

  it('11) cumulative union never shrinks even if later response has fewer loci', () => {
    const f = family([
      stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a1', actualAgeMs: 30_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO, bucketLocusManifestJson: ['speed|2026-09-16T11:59:10.000Z', 'rpm|2026-09-16T11:59:20.000Z'], uniqueBucketLocusCount: 2 }),
        attempt({ id: 'a2', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO, bucketLocusManifestJson: ['speed|2026-09-16T11:59:10.000Z'], uniqueBucketLocusCount: 1 }),
      ]),
    ]);
    const analysis = analyzeStratum(f, f.strata[0]);
    expect(analysis.maturationObservations[0].cumulativeBucketLocusUnionCount).toBe(2);
    expect(analysis.maturationObservations[1].cumulativeBucketLocusUnionCount).toBe(2);
  });

  it('12) final-union-zero => coverage NULL', () => {
    const f = family([
      stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a1', actualAgeMs: 30_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO, bucketLocusManifestJson: [], uniqueBucketLocusCount: 0 }),
      ]),
    ]);
    const analysis = analyzeStratum(f, f.strata[0]);
    expect(analysis.maturationObservations[0].bucketLocusCoverageRatioVsFinalObservedUnion).toBeNull();
  });

  it('13) new loci vs prior actual age', () => {
    const f = family([
      stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a1', actualAgeMs: 30_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO, bucketLocusManifestJson: ['speed|2026-09-16T11:59:10.000Z'] }),
        attempt({ id: 'a2', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO, bucketLocusManifestJson: ['rpm|2026-09-16T11:59:20.000Z'] }),
      ]),
    ]);
    const analysis = analyzeStratum(f, f.strata[0]);
    expect(analysis.maturationObservations[0].newBucketLociVsPriorAge).toBe(1);
    expect(analysis.maturationObservations[1].newBucketLociVsPriorAge).toBe(1);
  });

  it('14) per-field union/coverage', () => {
    const f = family([
      stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a1', actualAgeMs: 30_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO, bucketLocusManifestJson: ['speed|2026-09-16T11:59:10.000Z'] }),
        attempt({ id: 'a2', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO, bucketLocusManifestJson: ['speed|2026-09-16T11:59:20.000Z'] }),
      ]),
    ]);
    const analysis = analyzeStratum(f, f.strata[0]);
    const perField = computePerFieldMaturation(analysis, f.strata[0]);
    expect(perField.speed).toHaveLength(2);
    expect(perField.speed[1].cumulativeFieldUnionCount).toBe(2);
  });

  it('15) payload revision fields remain separate from locus coverage', () => {
    const f = family([
      stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a1', actualAgeMs: 30_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO, payloadRevisionCount: 2, changedPayloadLocusCount: 1 }),
      ]),
    ]);
    const analysis = analyzeStratum(f, f.strata[0]);
    expect(analysis.maturationObservations[0].payloadRevisionCount).toBe(2);
    expect(analysis.maturationObservations[0].changedPayloadLocusCount).toBe(1);
    expect(analysis.maturationObservations[0].reconstructedUniqueBucketLocusCount).toBe(1);
  });

  it('16) unsupported locus identity fails closed', () => {
    expect(() =>
      reconstructBucketLociFromAttempt({
        bucketLocusManifestJson: [],
        bucketLocusIdentityVersion: 'UNSUPPORTED',
        uniqueBucketLocusCount: 0,
      }),
    ).toThrow(Exp021MaturationShadowM3BucketLocusError);
  });

  it('17) malformed manifest fails closed', () => {
    expect(() =>
      reconstructBucketLociFromAttempt({
        bucketLocusManifestJson: { bad: true },
        bucketLocusIdentityVersion: CANONICAL_EXP021_BUCKET_IDENTITY,
        uniqueBucketLocusCount: 0,
      }),
    ).toThrow(Exp021MaturationShadowM3BucketLocusError);
  });

  it('18) persisted locus count mismatch detected', () => {
    const reconstruction = reconstructBucketLociFromAttempt({
      bucketLocusManifestJson: ['speed|2026-09-16T11:59:30.000Z', 'rpm|2026-09-16T11:59:31.000Z'],
      bucketLocusIdentityVersion: CANONICAL_EXP021_BUCKET_IDENTITY,
      uniqueBucketLocusCount: 1,
    });
    expect(reconstruction.persistedCountConsistent).toBe(false);
  });

  it('19) HF and Settlement remain separate strata', () => {
    const f = family([
      stratum({ id: 'hf', signalLane: Exp021MaturationShadowSignalLane.HF_FAST_LOOP, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a1', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO }),
      ]),
      stratum({ id: 'settle', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a2', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO }),
      ]),
    ]);
    const result = analyzeExp021MaturationShadowM3({
      families: [f],
      scope: { organizationId: 'org-1', vehicleId: 'veh-1' },
    });
    expect(result.stratumAnalyses).toHaveLength(2);
    expect(new Set(result.stratumAnalyses.map((s) => s.signalLane)).size).toBe(2);
  });

  it('20) 60s and 90s paired by family', () => {
    const f = family([
      stratum({ id: 's60', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a60', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO }),
      ]),
      stratum({ id: 's90', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 90_000 }, [
        attempt({ id: 'a90', actualAgeMs: 50_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO }),
      ]),
    ]);
    const result = analyzeExp021MaturationShadowM3({
      families: [f],
      scope: { organizationId: 'org-1', vehicleId: 'veh-1' },
    });
    expect(result.pairedGeometryObservations).toHaveLength(1);
    expect(result.pairedGeometryObservations[0].firstNonZeroActualAgeMs60).toBe(45_000);
    expect(result.pairedGeometryObservations[0].firstNonZeroActualAgeMs90).toBe(50_000);
  });

  it('21) family N not inflated by repeated ages', () => {
    const f = family([
      stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a1', actualAgeMs: 30_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO, bucketLocusManifestJson: [], uniqueBucketLocusCount: 0 }),
        attempt({ id: 'a2', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO }),
        attempt({ id: 'a3', actualAgeMs: 60_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO }),
      ]),
    ]);
    const result = analyzeExp021MaturationShadowM3({
      families: [f],
      scope: { organizationId: 'org-1', vehicleId: 'veh-1' },
    });
    expect(result.aggregateCounts.nWindowFamilies).toBe(1);
    expect(result.aggregateCounts.nValidProviderSuccessObservations).toBe(3);
  });

  it('22) geometry-specific activity strata preserved', () => {
    const f = family([
      stratum(
        {
          id: 's60',
          signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW,
          queryGeometryMs: 60_000,
          activityClassificationJson: { class: 'ACTIVE_MOTION', geometryMs: 60_000 },
        },
        [attempt({ id: 'a1', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO })],
      ),
    ]);
    const result = analyzeExp021MaturationShadowM3({
      families: [f],
      scope: { organizationId: 'org-1', vehicleId: 'veh-1', activityClass: 'ACTIVE_MOTION' },
    });
    expect(result.stratumAnalyses).toHaveLength(1);
    expect(result.stratumAnalyses[0].activityClass).toBe('ACTIVE_MOTION');
  });

  it('23) semantic cohort mismatch not blended', () => {
    const f = family([
      stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000, signalSetHash: 'sig-a' }, [
        attempt({ id: 'a1', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO, signalSetHash: 'sig-a' }),
      ]),
      stratum({ id: 's2', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 90_000, signalSetHash: 'sig-b' }, [
        attempt({ id: 'a2', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO, signalSetHash: 'sig-b' }),
      ]),
    ]);
    const result = analyzeExp021MaturationShadowM3({
      families: [f],
      scope: { organizationId: 'org-1', vehicleId: 'veh-1' },
    });
    expect(result.semanticCohortMismatchBlocked).toBe(true);
    expect(result.stratumAnalyses).toHaveLength(2);
  });

  it('24) provider errors visible but not availability-negative', () => {
    const f = family([
      stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a1', actualAgeMs: 40_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR, providerRequestSucceeded: false }),
        attempt({ id: 'a2', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO }),
      ]),
    ]);
    const analysis = analyzeStratum(f, f.strata[0]);
    expect(analysis.providerQuality.providerErrors).toBe(1);
    expect(analysis.availabilityTransition.censoringClass).toBe('LEFT_CENSORED');
  });

  it('25) Wilson interval known fixture', () => {
    const interval = wilsonScoreInterval(8, 10);
    expect(interval).not.toBeNull();
    expect(interval!.lower).toBeGreaterThan(0.4);
    expect(interval!.upper).toBeLessThanOrEqual(1);
  });

  it('26) median/P25/P75 known fixture', () => {
    const stats = medianP25P75([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(stats.median).toBe(5);
    expect(stats.p25).toBe(3);
    expect(stats.p75).toBe(7);
  });

  it('27) scheduler drift summary by planned age', () => {
    const f = family([
      stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a1', actualAgeMs: 45_200, plannedAgeMs: 45_000, schedulerDriftMs: 200, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO }),
        attempt({ id: 'a2', actualAgeMs: 45_400, plannedAgeMs: 45_000, schedulerDriftMs: 400, attemptOrdinal: 2, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO }),
        attempt({ id: 'a3', actualAgeMs: 45_600, plannedAgeMs: 45_000, schedulerDriftMs: 600, attemptOrdinal: 3, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO }),
      ]),
    ]);
    const analysis = analyzeStratum(f, f.strata[0]);
    const drift = analysis.schedulerDriftByPlannedAge.find((d) => d.plannedAgeMs === 45_000);
    expect(drift?.medianDriftMs).toBe(400);
    expect(drift?.p25DriftMs).toBe(200);
    expect(drift?.p75DriftMs).toBe(600);
  });

  it('28) deterministic JSON ordering', () => {
    const f = family([
      stratum({ id: 's1', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a1', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO }),
      ]),
    ]);
    const result = analyzeExp021MaturationShadowM3({
      families: [f],
      scope: { organizationId: 'org-1', vehicleId: 'veh-1' },
    });
    const json1 = serializeM3AnalysisJson(result, { deterministicGeneratedAt: '1970-01-01T00:00:00.000Z' });
    const json2 = serializeM3AnalysisJson(result, { deterministicGeneratedAt: '1970-01-01T00:00:00.000Z' });
    expect(json1).toBe(json2);
  });

  it('29) deterministic CSV ordering', () => {
    const f = family([
      stratum({ id: 's60', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 60_000 }, [
        attempt({ id: 'a60', actualAgeMs: 45_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO }),
      ]),
      stratum({ id: 's90', signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, queryGeometryMs: 90_000 }, [
        attempt({ id: 'a90', actualAgeMs: 50_000, providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO }),
      ]),
    ]);
    const result = analyzeExp021MaturationShadowM3({
      families: [f],
      scope: { organizationId: 'org-1', vehicleId: 'veh-1' },
    });
    const csv1 = serializeM3TransitionsCsv(result);
    const csv2 = serializeM3TransitionsCsv(result);
    expect(csv1).toBe(csv2);
    const paired1 = serializeM3PairedGeometryCsv(result);
    const paired2 = serializeM3PairedGeometryCsv(result);
    expect(paired1).toBe(paired2);
  });
});
