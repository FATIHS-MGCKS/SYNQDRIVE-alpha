import type { ShadowDetectorImplementation } from '../shadow-detector.port';
import {
  assessCadenceCoverageGate,
  assessDetectorCapabilityGate,
} from '../shadow-detector-gates';
import type {
  ShadowDetectorExecutionContext,
  ShadowDetectorResult,
} from '../shadow-detector.types';
import {
  buildExcessiveIdlingConfidence,
  clustersToCandidateEvents,
  detectExcessiveIdlingFromDimoSegments,
  detectExcessiveIdlingFromHf,
  EXCESSIVE_IDLING_SHADOW_POLICY,
  EXCESSIVE_IDLING_SHADOW_POLICY_VERSION,
  mergeExcessiveIdlingClusters,
  summarizeClustersForContext,
} from './excessive-idling-shadow.policy';

export const EXCESSIVE_IDLING_SHADOW_MODEL_VERSION =
  EXCESSIVE_IDLING_SHADOW_POLICY_VERSION;

export const excessiveIdlingShadowDetector: ShadowDetectorImplementation = {
  detectorId: 'idling_segment',
  modelVersion: EXCESSIVE_IDLING_SHADOW_MODEL_VERSION,

  detect(input): ShadowDetectorResult {
    const policy = EXCESSIVE_IDLING_SHADOW_POLICY;
    const ctx = input.executionContext;
    const capability = input.activeDetectorCapability;

    const capabilityGate = assessDetectorCapabilityGate({
      capability,
      requiredSignals: ['speed'],
    });
    if (!capabilityGate.passed) {
      return buildEmptyResult(
        'CAPABILITY_GATE_FAILED',
        capabilityGate.rejectionReasons,
        'NOT_ASSESSABLE',
        ctx,
        capabilityGate.status,
      );
    }

    if (!ctx) {
      return buildEmptyResult(
        'NO_EXECUTION_CONTEXT',
        ['NO_EXECUTION_CONTEXT'],
        'NOT_ASSESSABLE',
        undefined,
        capabilityGate.status ?? 'CONTEXT_ONLY',
      );
    }

    if (ctx.speedSampleCount === 0) {
      return buildEmptyResult(
        'MISSING_SPEED',
        ['MISSING_SPEED'],
        'NOT_ASSESSABLE',
        ctx,
        capabilityGate.status ?? 'CONTEXT_ONLY',
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

    const hfClusters =
      cadenceGate.passed
        ? detectExcessiveIdlingFromHf(ctx.hfSamples, ctx.isEvPowertrain, policy)
        : [];
    const dimoClusters = detectExcessiveIdlingFromDimoSegments(
      ctx.dimoIdlingSegments,
      policy,
    );

    if (!cadenceGate.passed && hfClusters.length === 0 && dimoClusters.length === 0) {
      return buildEmptyResult(
        'CADENCE_COVERAGE_GATE_FAILED',
        cadenceGate.rejectionReasons,
        'LIMITED',
        ctx,
        capabilityGate.status ?? 'CONTEXT_ONLY',
      );
    }

    const clusters = mergeExcessiveIdlingClusters(hfClusters, dimoClusters);
    const candidateEvents = clustersToCandidateEvents(clusters);

    return {
      detectorId: 'idling_segment',
      modelVersion: EXCESSIVE_IDLING_SHADOW_MODEL_VERSION,
      capabilityStatus: capabilityGate.status ?? 'CONTEXT_ONLY',
      assessability: candidateEvents.length > 0 ? 'LIMITED' : 'FULL',
      candidateEvents,
      context: buildContext(ctx, clusters, capabilityGate.status ?? 'CONTEXT_ONLY', null),
      confidence: buildExcessiveIdlingConfidence({
        coverage: ctx.hfCoverage,
        clusters,
        dimoSegmentCount: ctx.dimoIdlingSegments.length,
      }),
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
  clusters: ReturnType<typeof mergeExcessiveIdlingClusters>,
  capabilityStatus: ShadowDetectorResult['capabilityStatus'],
  emptyReason: string | null,
): Record<string, string | number | boolean | null> {
  return {
    shadowMode: true,
    publicationBlocked: true,
    policyVersion: EXCESSIVE_IDLING_SHADOW_POLICY_VERSION,
    capabilityStatus,
    vehicleContextOnly: true,
    notConfirmedAbuse: true,
    noMisuse: true,
    noOperationalImpact: true,
    dimoIdlingSupplementaryOnly: true,
    dimoIdlingSegmentCount: ctx.dimoIdlingSegments.length,
    dimoIdlingProviderError: ctx.dimoIdlingProviderError,
    providerGaps: ctx.providerGaps.join(','),
    clusterCount: clusters.length,
    clusterSummary: summarizeClustersForContext(clusters),
    tripDurationMs: ctx.tripContext.tripDurationMs,
    isEvPowertrain: ctx.isEvPowertrain,
    ignitionSampleCount: ctx.ignitionSampleCount,
    engineRuntimeSampleCount: ctx.engineRuntimeSampleCount,
    hfCoverage: ctx.hfCoverage,
    emptyReason,
  };
}

function buildEmptyResult(
  emptyReason: string,
  rejectionReasons: string[],
  assessability: ShadowDetectorResult['assessability'],
  ctx: ShadowDetectorExecutionContext | null | undefined,
  capabilityStatus: ShadowDetectorResult['capabilityStatus'] | null,
): ShadowDetectorResult {
  const status = capabilityStatus ?? 'CONTEXT_ONLY';
  return {
    detectorId: 'idling_segment',
    modelVersion: EXCESSIVE_IDLING_SHADOW_MODEL_VERSION,
    capabilityStatus: status,
    assessability,
    candidateEvents: [],
    context: ctx
      ? buildContext(ctx, [], status, emptyReason)
      : {
          shadowMode: true,
          publicationBlocked: true,
          policyVersion: EXCESSIVE_IDLING_SHADOW_POLICY_VERSION,
          capabilityStatus: status,
          notConfirmedAbuse: true,
          noMisuse: true,
          noOperationalImpact: true,
          emptyReason,
        },
    confidence: null,
    coverage: ctx?.hfCoverage ?? null,
    rejectionReasons,
    comparisonWithNativeEvents: null,
    comparisonWithMisuseCases: null,
    skipped: false,
  };
}
