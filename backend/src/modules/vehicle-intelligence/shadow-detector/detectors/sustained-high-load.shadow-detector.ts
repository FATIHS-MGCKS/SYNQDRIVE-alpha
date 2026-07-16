import type { ShadowDetectorImplementation } from '../shadow-detector.port';
import {
  assessCadenceCoverageGate,
  assessDetectorCapabilityGate,
} from '../shadow-detector-gates';
import type {
  ShadowDetectorExecutionContext,
  ShadowDetectorResult,
} from '../shadow-detector.types';
import { isPhevFuelType } from './cold-engine-shadow.policy';
import {
  buildSustainedHighLoadConfidence,
  clustersToCandidateEvents,
  detectSustainedHighLoadClusters,
  SUSTAINED_HIGH_LOAD_SHADOW_POLICY,
  SUSTAINED_HIGH_LOAD_SHADOW_POLICY_VERSION,
} from './sustained-high-load-shadow.policy';

export const SUSTAINED_HIGH_LOAD_SHADOW_MODEL_VERSION =
  SUSTAINED_HIGH_LOAD_SHADOW_POLICY_VERSION;

export const sustainedHighLoadShadowDetector: ShadowDetectorImplementation = {
  detectorId: 'sustained_high_load',
  modelVersion: SUSTAINED_HIGH_LOAD_SHADOW_MODEL_VERSION,

  detect(input): ShadowDetectorResult {
    const policy = SUSTAINED_HIGH_LOAD_SHADOW_POLICY;
    const ctx = input.executionContext;
    const capability = input.activeDetectorCapability;

    const capabilityGate = assessDetectorCapabilityGate({
      capability,
      requiredSignals: ['obdEngineLoad'],
    });
    if (!capabilityGate.passed) {
      return buildEmptyResult(
        'CAPABILITY_GATE_FAILED',
        capabilityGate.rejectionReasons,
        'NOT_ASSESSABLE',
        ctx,
        capabilityGate.status ?? 'SHADOW',
      );
    }

    if (!ctx) {
      return buildEmptyResult(
        'NO_EXECUTION_CONTEXT',
        ['NO_EXECUTION_CONTEXT'],
        'NOT_ASSESSABLE',
        undefined,
        capabilityGate.status ?? 'SHADOW',
      );
    }

    if (ctx.isEvPowertrain) {
      return buildEmptyResult(
        'EV_POWERTRAIN',
        ['POWERTRAIN_NOT_APPLICABLE'],
        'NOT_ASSESSABLE',
        ctx,
        capabilityGate.status ?? 'SHADOW',
      );
    }

    if (isPhevFuelType(ctx.fuelType) && !ctx.iceOperationConfirmed) {
      return buildEmptyResult(
        'ICE_OPERATION_NOT_CONFIRMED',
        ['ICE_OPERATION_NOT_CONFIRMED'],
        'NOT_ASSESSABLE',
        ctx,
        capabilityGate.status ?? 'SHADOW',
      );
    }

    const cadenceGate = assessCadenceCoverageGate({
      effectiveCadenceMs: ctx.effectiveCadenceMs,
      coverage: ctx.hfCoverage,
      sampleCount: ctx.hfSamples.length,
      capabilityCadenceMs: capability?.effectiveCadenceMs ?? null,
      capabilityCoverage: capability?.coverage ?? null,
      policy,
    });

    if (!cadenceGate.passed) {
      return buildEmptyResult(
        'CADENCE_COVERAGE_GATE_FAILED',
        cadenceGate.rejectionReasons,
        'LIMITED',
        ctx,
        capabilityGate.status ?? 'SHADOW',
        'Minimum duration/coverage not met for sustained load assessment.',
      );
    }

    const clusters = detectSustainedHighLoadClusters(ctx.hfSamples, policy);
    const candidateEvents = clustersToCandidateEvents(clusters);
    const confidence = buildSustainedHighLoadConfidence({
      coverage: ctx.hfCoverage,
      clusters,
      totalSamples: ctx.hfSamples.length,
    });

    return {
      detectorId: 'sustained_high_load',
      modelVersion: SUSTAINED_HIGH_LOAD_SHADOW_MODEL_VERSION,
      capabilityStatus: capabilityGate.status ?? 'SHADOW',
      assessability: candidateEvents.length > 0 ? 'LIMITED' : 'FULL',
      candidateEvents,
      context: buildContext(ctx, clusters, {
        emptyReason: null,
        note: null,
      }),
      confidence,
      coverage: ctx.hfCoverage,
      rejectionReasons: [],
      comparisonWithNativeEvents: null,
      comparisonWithMisuseCases: null,
      skipped: false,
    };
  },
};

function buildContext(
  ctx: ShadowDetectorExecutionContext,
  clusters: ReturnType<typeof detectSustainedHighLoadClusters>,
  extra: { emptyReason: string | null; note: string | null },
): Record<string, string | number | boolean | null> {
  const uphillClusters = clusters.filter((c) => c.uphillContext).length;
  const highwayClusters = clusters.filter((c) => c.highwayContext).length;

  return {
    shadowMode: true,
    publicationBlocked: true,
    policyVersion: SUSTAINED_HIGH_LOAD_SHADOW_POLICY_VERSION,
    vehicleLoadContextOnly: true,
    noCustomerJudgment: true,
    noHealthImpact: true,
    fuelType: ctx.fuelType,
    iceOperationConfirmed: ctx.iceOperationConfirmed,
    hfSampleCount: ctx.hfSamples.length,
    effectiveCadenceMs: ctx.effectiveCadenceMs,
    hfCoverage: ctx.hfCoverage,
    coolantSampleCount: ctx.coolantSampleCount,
    altitudeSampleCount: ctx.hfSamples.filter((s) => s.altitudeM != null).length,
    clusterCount: clusters.length,
    uphillClusterCount: uphillClusters,
    highwayClusterCount: highwayClusters,
    uphillReducesConfidenceOnly: true,
    candidateNotConfirmedAbuse: true,
    emptyReason: extra.emptyReason,
    note: extra.note,
  };
}

function buildEmptyResult(
  emptyReason: string,
  rejectionReasons: string[],
  assessability: ShadowDetectorResult['assessability'],
  ctx: ShadowDetectorExecutionContext | null | undefined,
  capabilityStatus: ShadowDetectorResult['capabilityStatus'],
  note?: string,
): ShadowDetectorResult {
  return {
    detectorId: 'sustained_high_load',
    modelVersion: SUSTAINED_HIGH_LOAD_SHADOW_MODEL_VERSION,
    capabilityStatus,
    assessability,
    candidateEvents: [],
    context: ctx
      ? buildContext(ctx, [], { emptyReason, note: note ?? null })
      : {
          shadowMode: true,
          publicationBlocked: true,
          policyVersion: SUSTAINED_HIGH_LOAD_SHADOW_POLICY_VERSION,
          vehicleLoadContextOnly: true,
          noCustomerJudgment: true,
          noHealthImpact: true,
          emptyReason,
          candidateNotConfirmedAbuse: true,
          note: note ?? null,
        },
    confidence: null,
    coverage: ctx?.hfCoverage ?? null,
    rejectionReasons,
    comparisonWithNativeEvents: null,
    comparisonWithMisuseCases: null,
    skipped: false,
  };
}
