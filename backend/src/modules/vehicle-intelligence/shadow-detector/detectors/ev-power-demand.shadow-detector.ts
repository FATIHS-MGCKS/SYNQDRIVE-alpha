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
  buildEvPowerDemandConfidence,
  clustersToCandidateEvents,
  detectEvHighPowerDemandClusters,
  EV_POWER_DEMAND_SHADOW_POLICY,
  EV_POWER_DEMAND_SHADOW_POLICY_VERSION,
  inferEvPowerSignConvention,
  summarizeClustersForContext,
} from './ev-power-demand-shadow.policy';

export const EV_POWER_DEMAND_SHADOW_MODEL_VERSION =
  EV_POWER_DEMAND_SHADOW_POLICY_VERSION;

export const evPowerDemandShadowDetector: ShadowDetectorImplementation = {
  detectorId: 'ev_power_demand',
  modelVersion: EV_POWER_DEMAND_SHADOW_MODEL_VERSION,

  detect(input): ShadowDetectorResult {
    const policy = EV_POWER_DEMAND_SHADOW_POLICY;
    const ctx = input.executionContext;
    const capability = input.activeDetectorCapability;

    const capabilityGate = assessDetectorCapabilityGate({
      capability,
      requiredSignals: ['powertrainTractionBatteryCurrentPower'],
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

    if (!ctx.isEvPowertrain) {
      return buildEmptyResult(
        'NON_EV_POWERTRAIN',
        ['POWERTRAIN_NOT_APPLICABLE'],
        'NOT_ASSESSABLE',
        ctx,
        capabilityGate.status ?? 'SHADOW',
        'EV power demand shadow is BEV-only.',
      );
    }

    if (ctx.tractionBatteryPowerSampleCount === 0) {
      return buildEmptyResult(
        'MISSING_TRACTION_BATTERY_POWER',
        ['MISSING_TRACTION_BATTERY_POWER'],
        'NOT_ASSESSABLE',
        ctx,
        capabilityGate.status ?? 'SHADOW',
        'No traction battery power samples in trip window.',
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
        'Effective cadence/coverage insufficient for EV power demand assessment.',
      );
    }

    const signConvention = inferEvPowerSignConvention(ctx.hfSamples, policy);
    const clusters = detectEvHighPowerDemandClusters(ctx.hfSamples, policy);
    const candidateEvents = clustersToCandidateEvents(clusters);

    return {
      detectorId: 'ev_power_demand',
      modelVersion: EV_POWER_DEMAND_SHADOW_MODEL_VERSION,
      capabilityStatus: capabilityGate.status ?? 'SHADOW',
      assessability: candidateEvents.length > 0 ? 'LIMITED' : 'FULL',
      candidateEvents,
      context: buildContext(ctx, clusters, signConvention, null),
      confidence: buildEvPowerDemandConfidence({
        coverage: ctx.hfCoverage,
        clusters,
        signConvention,
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
  clusters: ReturnType<typeof detectEvHighPowerDemandClusters>,
  signConvention: ReturnType<typeof inferEvPowerSignConvention>,
  emptyReason: string | null,
): Record<string, string | number | boolean | null> {
  return {
    shadowMode: true,
    publicationBlocked: true,
    policyVersion: EV_POWER_DEMAND_SHADOW_POLICY_VERSION,
    vehicleLoadContextOnly: true,
    noCustomerJudgment: true,
    noHealthImpact: true,
    notAggressiveDriverClaim: true,
    capabilityStatus: 'SHADOW',
    signConvention,
    signConventionEmpirical: true,
    tractionBatteryPowerSampleCount: ctx.tractionBatteryPowerSampleCount,
    socSampleCount: ctx.socSampleCount,
    tractionBatteryTemperatureSampleCount: ctx.tractionBatteryTemperatureSampleCount,
    exteriorTempSampleCount: ctx.exteriorTempSampleCount,
    providerGaps: ctx.providerGaps.join(','),
    effectiveCadenceMs: ctx.effectiveCadenceMs,
    hfCoverage: ctx.hfCoverage,
    tripDurationMs: ctx.tripContext.tripDurationMs,
    clusterCount: clusters.length,
    uphillClusterCount: clusters.filter((c) => c.uphillContext).length,
    rampClusterCount: clusters.filter((c) => c.rampContext).length,
    highwayClusterCount: clusters.filter((c) => c.highwayContext).length,
    uphillReducesConfidenceOnly: true,
    rampReducesConfidenceOnly: true,
    clusterSummary: summarizeClustersForContext(clusters),
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
  const signConvention =
    ctx?.hfSamples?.length ? inferEvPowerSignConvention(ctx.hfSamples) : 'UNKNOWN';

  return {
    detectorId: 'ev_power_demand',
    modelVersion: EV_POWER_DEMAND_SHADOW_MODEL_VERSION,
    capabilityStatus: status,
    assessability,
    candidateEvents: [],
    context: ctx
      ? buildContext(ctx, [], signConvention, emptyReason)
      : {
          shadowMode: true,
          publicationBlocked: true,
          policyVersion: EV_POWER_DEMAND_SHADOW_POLICY_VERSION,
          vehicleLoadContextOnly: true,
          noCustomerJudgment: true,
          noHealthImpact: true,
          notAggressiveDriverClaim: true,
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
