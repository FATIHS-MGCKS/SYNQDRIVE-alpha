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
  buildKickdownLikeConfidence,
  clustersToCandidateEvents,
  detectKickdownLikeClusters,
  isGearSignalAvailable,
  KICKDOWN_LIKE_SHADOW_POLICY,
  KICKDOWN_LIKE_SHADOW_POLICY_VERSION,
  summarizeClustersForContext,
} from './kickdown-like-shadow.policy';

export const KICKDOWN_LIKE_SHADOW_MODEL_VERSION = KICKDOWN_LIKE_SHADOW_POLICY_VERSION;

export const kickdownLikeShadowDetector: ShadowDetectorImplementation = {
  detectorId: 'start_kickdown_proxy',
  modelVersion: KICKDOWN_LIKE_SHADOW_MODEL_VERSION,

  detect(input): ShadowDetectorResult {
    const policy = KICKDOWN_LIKE_SHADOW_POLICY;
    const ctx = input.executionContext;
    const capability = input.activeDetectorCapability;

    const capabilityGate = assessDetectorCapabilityGate({
      capability,
      requiredSignals: ['obdThrottlePosition', 'speed'],
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
        'CADENCE_SYNC_GATE_FAILED',
        cadenceGate.rejectionReasons,
        'LIMITED',
        ctx,
        capabilityGate.status ?? 'SHADOW',
        'Cadence/coverage gate blocked kickdown-like assessment.',
      );
    }

    const gearAvailable = isGearSignalAvailable(ctx.hfSamples);
    const clusters = detectKickdownLikeClusters(ctx.hfSamples, policy);
    const candidateEvents = clustersToCandidateEvents(clusters);
    const confidence = buildKickdownLikeConfidence({
      coverage: ctx.hfCoverage,
      clusters,
    });

    return {
      detectorId: 'start_kickdown_proxy',
      modelVersion: KICKDOWN_LIKE_SHADOW_MODEL_VERSION,
      capabilityStatus: capabilityGate.status ?? 'SHADOW',
      assessability: candidateEvents.length > 0 ? 'LIMITED' : 'FULL',
      candidateEvents,
      context: buildContext(ctx, clusters, gearAvailable, {
        emptyReason: null,
        note: null,
        capabilityStatus: capabilityGate.status ?? 'SHADOW',
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
  clusters: ReturnType<typeof detectKickdownLikeClusters>,
  gearAvailable: boolean,
  extra: {
    emptyReason: string | null;
    note: string | null;
    capabilityStatus: ShadowDetectorResult['capabilityStatus'];
  },
): Record<string, string | number | boolean | null> {
  return {
    shadowMode: true,
    publicationBlocked: true,
    policyVersion: KICKDOWN_LIKE_SHADOW_POLICY_VERSION,
    capabilityStatus: extra.capabilityStatus,
    notARealKickdown: true,
    proxyOnlyEventType: 'KICKDOWN_LIKE_PROXY',
    noMisuse: true,
    noAlert: true,
    noCustomerJudgment: true,
    vehicleLoadContextOnly: true,
    gearSignalAvailable: gearAvailable,
    gearClusterCount: clusters.filter((c) => c.gearChangeObserved).length,
    clusterCount: clusters.length,
    clusterSummary: summarizeClustersForContext(clusters),
    hfSampleCount: ctx.hfSamples.length,
    effectiveCadenceMs: ctx.effectiveCadenceMs,
    hfCoverage: ctx.hfCoverage,
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
  capabilityStatus: ShadowDetectorResult['capabilityStatus'] | null,
  note?: string,
): ShadowDetectorResult {
  const status = capabilityStatus ?? 'SHADOW';
  return {
    detectorId: 'start_kickdown_proxy',
    modelVersion: KICKDOWN_LIKE_SHADOW_MODEL_VERSION,
    capabilityStatus: status,
    assessability,
    candidateEvents: [],
    context: ctx
      ? buildContext(ctx, [], isGearSignalAvailable(ctx.hfSamples), {
          emptyReason,
          note: note ?? null,
          capabilityStatus: status,
        })
      : {
          shadowMode: true,
          publicationBlocked: true,
          policyVersion: KICKDOWN_LIKE_SHADOW_POLICY_VERSION,
          capabilityStatus: status,
          notARealKickdown: true,
          proxyOnlyEventType: 'KICKDOWN_LIKE_PROXY',
          noMisuse: true,
          noAlert: true,
          noCustomerJudgment: true,
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
