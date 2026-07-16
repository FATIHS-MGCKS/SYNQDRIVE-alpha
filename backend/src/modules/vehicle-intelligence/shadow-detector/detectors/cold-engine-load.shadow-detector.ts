import type { ShadowDetectorImplementation } from '../shadow-detector.port';
import type {
  ShadowDetectorExecutionContext,
  ShadowDetectorResult,
} from '../shadow-detector.types';
import {
  assessCadenceCoverageGate,
  buildColdEngineShadowConfidence,
  clustersToCandidateEvents,
  COLD_ENGINE_SHADOW_POLICY,
  COLD_ENGINE_SHADOW_POLICY_VERSION,
  detectColdEngineLoadClusters,
} from './cold-engine-shadow.policy';

export const COLD_ENGINE_LOAD_SHADOW_MODEL_VERSION = COLD_ENGINE_SHADOW_POLICY_VERSION;

export const coldEngineLoadShadowDetector: ShadowDetectorImplementation = {
  detectorId: 'cold_engine_load',
  modelVersion: COLD_ENGINE_LOAD_SHADOW_MODEL_VERSION,

  detect(input): ShadowDetectorResult {
    const policy = COLD_ENGINE_SHADOW_POLICY;
    const ctx = input.executionContext;

    if (!ctx) {
      return buildEmptyResult('NO_EXECUTION_CONTEXT', ['NO_EXECUTION_CONTEXT'], 'NOT_ASSESSABLE');
    }

    if (ctx.isEvPowertrain) {
      return buildEmptyResult(
        'EV_POWERTRAIN',
        ['POWERTRAIN_NOT_APPLICABLE'],
        'NOT_ASSESSABLE',
        ctx,
      );
    }

    if (ctx.coolantSampleCount === 0) {
      return buildEmptyResult(
        'COOLANT_UNAVAILABLE',
        ['COOLANT_UNAVAILABLE'],
        'NOT_ASSESSABLE',
        ctx,
        'Missing coolant temperature — exterior temperature is never substituted.',
      );
    }

    if (ctx.isPhev && !ctx.iceOperationConfirmed) {
      return buildEmptyResult(
        'ICE_OPERATION_NOT_CONFIRMED',
        ['ICE_OPERATION_NOT_CONFIRMED'],
        'NOT_ASSESSABLE',
        ctx,
        'PHEV trip without confirmed ICE combustion activity.',
      );
    }

    const gate = assessCadenceCoverageGate({
      effectiveCadenceMs: ctx.effectiveCadenceMs,
      coverage: ctx.hfCoverage,
      sampleCount: ctx.hfSamples.length,
      capabilityCadenceMs: null,
      capabilityCoverage: null,
      policy,
    });

    if (!gate.passed) {
      return buildEmptyResult(
        'CADENCE_COVERAGE_GATE_FAILED',
        gate.rejectionReasons,
        'LIMITED',
        ctx,
        'Cadence/coverage gate blocked cluster detection.',
      );
    }

    const clusters = detectColdEngineLoadClusters(ctx.hfSamples, policy);
    const candidateEvents = clustersToCandidateEvents(clusters);
    const confidence = buildColdEngineShadowConfidence({
      coverage: ctx.hfCoverage,
      clusterCount: clusters.length,
      coolantSampleCount: ctx.coolantSampleCount,
      totalSamples: ctx.hfSamples.length,
    });

    return {
      detectorId: 'cold_engine_load',
      modelVersion: COLD_ENGINE_LOAD_SHADOW_MODEL_VERSION,
      capabilityStatus: 'SHADOW',
      assessability: candidateEvents.length > 0 ? 'LIMITED' : 'FULL',
      candidateEvents,
      context: buildContext(ctx, {
        clusterCount: clusters.length,
        note: null,
        emptyReason: null,
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
  extra: {
    clusterCount: number;
    note: string | null;
    emptyReason: string | null;
  },
): Record<string, string | number | boolean | null> {
  return {
    shadowMode: true,
    publicationBlocked: true,
    policyVersion: COLD_ENGINE_SHADOW_POLICY_VERSION,
    fuelType: ctx.fuelType,
    isPhev: ctx.isPhev,
    iceOperationConfirmed: ctx.iceOperationConfirmed,
    coolantSampleCount: ctx.coolantSampleCount,
    exteriorTempSampleCount: ctx.exteriorTempSampleCount,
    exteriorTempNotUsedAsCoolantProxy: true,
    hfSampleCount: ctx.hfSamples.length,
    effectiveCadenceMs: ctx.effectiveCadenceMs,
    hfCoverage: ctx.hfCoverage,
    clusterCount: extra.clusterCount,
    candidateNotConfirmedAbuse: true,
    emptyReason: extra.emptyReason,
    note: extra.note,
  };
}

function buildEmptyResult(
  emptyReason: string,
  rejectionReasons: string[],
  assessability: ShadowDetectorResult['assessability'],
  ctx?: ShadowDetectorExecutionContext,
  note?: string,
): ShadowDetectorResult {
  return {
    detectorId: 'cold_engine_load',
    modelVersion: COLD_ENGINE_LOAD_SHADOW_MODEL_VERSION,
    capabilityStatus: 'SHADOW',
    assessability,
    candidateEvents: [],
    context: ctx
      ? buildContext(ctx, { clusterCount: 0, note: note ?? null, emptyReason })
      : {
          shadowMode: true,
          publicationBlocked: true,
          policyVersion: COLD_ENGINE_SHADOW_POLICY_VERSION,
          emptyReason,
          candidateNotConfirmedAbuse: true,
          exteriorTempNotUsedAsCoolantProxy: true,
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
