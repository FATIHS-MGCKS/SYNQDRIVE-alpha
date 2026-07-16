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
  buildHighRpmStationaryConfidence,
  clustersToCandidateEvents,
  detectHighRpmStationaryClusters,
  HIGH_RPM_STATIONARY_SHADOW_POLICY,
  HIGH_RPM_STATIONARY_SHADOW_POLICY_VERSION,
  summarizeClustersForContext,
} from './high-rpm-stationary-shadow.policy';

export const HIGH_RPM_STATIONARY_SHADOW_MODEL_VERSION =
  HIGH_RPM_STATIONARY_SHADOW_POLICY_VERSION;

export const highRpmStationaryShadowDetector: ShadowDetectorImplementation = {
  detectorId: 'rev_in_idle',
  modelVersion: HIGH_RPM_STATIONARY_SHADOW_MODEL_VERSION,

  detect(input): ShadowDetectorResult {
    const policy = HIGH_RPM_STATIONARY_SHADOW_POLICY;
    const ctx = input.executionContext;
    const capability = input.activeDetectorCapability;

    const capabilityGate = assessDetectorCapabilityGate({
      capability,
      requiredSignals: ['powertrainCombustionEngineSpeed', 'speed'],
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
        'BEV/EV — high RPM stationary proxy is ICE/PHEV combustion only.',
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

    if (ctx.rpmSampleCount === 0) {
      return buildEmptyResult(
        'MISSING_RPM',
        ['MISSING_RPM'],
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
        'CADENCE_SYNC_GATE_FAILED',
        cadenceGate.rejectionReasons,
        'LIMITED',
        ctx,
        capabilityGate.status ?? 'SHADOW',
      );
    }

    const clusters = detectHighRpmStationaryClusters(ctx.hfSamples, policy);
    const candidateEvents = clustersToCandidateEvents(clusters);

    return {
      detectorId: 'rev_in_idle',
      modelVersion: HIGH_RPM_STATIONARY_SHADOW_MODEL_VERSION,
      capabilityStatus: capabilityGate.status ?? 'SHADOW',
      assessability: candidateEvents.length > 0 ? 'LIMITED' : 'FULL',
      candidateEvents,
      context: buildContext(ctx, clusters, capabilityGate.status ?? 'SHADOW', null),
      confidence: buildHighRpmStationaryConfidence({
        coverage: ctx.hfCoverage,
        clusters,
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
  clusters: ReturnType<typeof detectHighRpmStationaryClusters>,
  capabilityStatus: ShadowDetectorResult['capabilityStatus'],
  emptyReason: string | null,
): Record<string, string | number | boolean | null> {
  return {
    shadowMode: true,
    publicationBlocked: true,
    policyVersion: HIGH_RPM_STATIONARY_SHADOW_POLICY_VERSION,
    capabilityStatus,
    proxyEventType: 'HIGH_RPM_WHILE_STATIONARY_PROXY',
    notConfirmedAbuse: true,
    noMisuse: true,
    noOperationalImpact: true,
    clusterCount: clusters.length,
    clusterSummary: summarizeClustersForContext(clusters),
    providerGaps: ctx.providerGaps.join(','),
    ignitionSampleCount: ctx.ignitionSampleCount,
    rpmSampleCount: ctx.rpmSampleCount,
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
  note?: string,
): ShadowDetectorResult {
  const status = capabilityStatus ?? 'SHADOW';
  return {
    detectorId: 'rev_in_idle',
    modelVersion: HIGH_RPM_STATIONARY_SHADOW_MODEL_VERSION,
    capabilityStatus: status,
    assessability,
    candidateEvents: [],
    context: ctx
      ? buildContext(ctx, [], status, emptyReason)
      : {
          shadowMode: true,
          publicationBlocked: true,
          policyVersion: HIGH_RPM_STATIONARY_SHADOW_POLICY_VERSION,
          capabilityStatus: status,
          proxyEventType: 'HIGH_RPM_WHILE_STATIONARY_PROXY',
          notConfirmedAbuse: true,
          noMisuse: true,
          noOperationalImpact: true,
          emptyReason,
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
