import type {
  DrivingDetectorKey,
  DrivingDetectorSupportStatus,
  ResolvedDrivingDetectorCapability,
} from '../driving-detector-capability/driving-detector-capability.types';
import {
  SHADOW_ENGINE_DETECTOR_KEYS,
  SHADOW_HF_SIGNAL_DETECTOR_KEYS,
  SHADOW_DETECTOR_NATIVE_COMPARE_WINDOW_SEC,
} from './shadow-detector.config';
import {
  assertShadowResultIsolation,
  buildSkippedShadowResult,
  canExecuteShadowDetector,
  compareShadowCandidatesWithNativeEvents,
} from './shadow-detector.contract';
import type { ShadowDetectorImplementation } from './shadow-detector.port';
import {
  SHADOW_DETECTOR_FRAMEWORK_VERSION,
  type ShadowDetectorResult,
  type ShadowDetectorRunInput,
  type ShadowDetectorRunOutcome,
} from './shadow-detector.types';

export type ShadowDetectorRunnerInput = {
  trip: ShadowDetectorRunInput;
  capabilities: readonly ResolvedDrivingDetectorCapability[];
  implementations: readonly ShadowDetectorImplementation[];
  nativeEvents: readonly { eventType: string; occurredAt: Date }[];
  engineShadowEnabled: boolean;
  hfShadowEnabled: boolean;
};

function isEngineDetector(detectorId: DrivingDetectorKey): boolean {
  return (SHADOW_ENGINE_DETECTOR_KEYS as readonly string[]).includes(detectorId);
}

function isHfSignalDetector(detectorId: DrivingDetectorKey): boolean {
  return (SHADOW_HF_SIGNAL_DETECTOR_KEYS as readonly string[]).includes(detectorId);
}

function isFrameworkDetector(detectorId: DrivingDetectorKey): boolean {
  return isEngineDetector(detectorId) || isHfSignalDetector(detectorId);
}

function isShadowFlagEnabled(
  detectorId: DrivingDetectorKey,
  engineShadowEnabled: boolean,
  hfShadowEnabled: boolean,
): boolean {
  if (isEngineDetector(detectorId)) return engineShadowEnabled;
  if (isHfSignalDetector(detectorId)) return hfShadowEnabled;
  return false;
}

function capabilityFor(
  capabilities: readonly ResolvedDrivingDetectorCapability[],
  detectorId: DrivingDetectorKey,
): ResolvedDrivingDetectorCapability | undefined {
  return capabilities.find((c) => c.detectorKey === detectorId);
}

function finalizeResult(
  result: ShadowDetectorResult,
  nativeEvents: readonly { eventType: string; occurredAt: Date }[],
): ShadowDetectorResult {
  const withComparison: ShadowDetectorResult = {
    ...result,
    comparisonWithNativeEvents:
      result.comparisonWithNativeEvents ??
      compareShadowCandidatesWithNativeEvents({
        candidateEvents: result.candidateEvents,
        nativeEvents,
        windowSeconds: SHADOW_DETECTOR_NATIVE_COMPARE_WINDOW_SEC,
      }),
  };
  assertShadowResultIsolation(withComparison);
  return withComparison;
}

export async function runShadowDetectorFramework(
  input: ShadowDetectorRunnerInput,
): Promise<ShadowDetectorRunOutcome> {
  const ranAt = new Date().toISOString();

  if (!input.engineShadowEnabled && !input.hfShadowEnabled) {
    return {
      frameworkVersion: SHADOW_DETECTOR_FRAMEWORK_VERSION,
      tripId: input.trip.tripId,
      analysisRunId: input.trip.analysisRunId,
      ranAt,
      results: [],
      skippedFramework: true,
      skipReason: 'shadow_flags_disabled',
    };
  }

  const implById = new Map(input.implementations.map((impl) => [impl.detectorId, impl]));
  const results: ShadowDetectorResult[] = [];

  for (const capability of input.capabilities) {
    const detectorId = capability.detectorKey;
    if (!isFrameworkDetector(detectorId)) continue;

    const impl = implById.get(detectorId);
    const modelVersion = impl?.modelVersion ?? `${detectorId}-shadow-v0`;

    if (!isShadowFlagEnabled(detectorId, input.engineShadowEnabled, input.hfShadowEnabled)) {
      results.push(
        buildSkippedShadowResult({
          detectorId,
          modelVersion,
          capabilityStatus: capability.status,
          skipReason: 'shadow_flag_disabled',
        }),
      );
      continue;
    }

    if (capability.status === 'UNSUPPORTED') {
      results.push(
        buildSkippedShadowResult({
          detectorId,
          modelVersion,
          capabilityStatus: capability.status,
          skipReason: 'capability_unsupported',
          rejectionReasons: capability.missingRequirements,
        }),
      );
      continue;
    }

    if (capability.status === 'PRODUCTION') {
      results.push(
        buildSkippedShadowResult({
          detectorId,
          modelVersion,
          capabilityStatus: capability.status,
          skipReason: 'production_native_path',
        }),
      );
      continue;
    }

    if (!canExecuteShadowDetector(capability.status)) {
      results.push(
        buildSkippedShadowResult({
          detectorId,
          modelVersion,
          capabilityStatus: capability.status,
          skipReason: 'capability_not_executable',
        }),
      );
      continue;
    }

    if (!impl) {
      results.push(
        buildSkippedShadowResult({
          detectorId,
          modelVersion,
          capabilityStatus: capability.status,
          skipReason: 'no_implementation_registered',
        }),
      );
      continue;
    }

    const raw = await impl.detect(input.trip);
    results.push(
      finalizeResult(
        {
          ...raw,
          detectorId,
          modelVersion: impl.modelVersion,
          capabilityStatus: capability.status,
        },
        input.nativeEvents,
      ),
    );
  }

  return {
    frameworkVersion: SHADOW_DETECTOR_FRAMEWORK_VERSION,
    tripId: input.trip.tripId,
    analysisRunId: input.trip.analysisRunId,
    ranAt,
    results,
    skippedFramework: false,
  };
}

export function mapCapabilityStatusToAssessability(
  status: DrivingDetectorSupportStatus,
): ShadowDetectorResult['assessability'] {
  switch (status) {
    case 'SHADOW':
    case 'PROVIDER_DEPENDENT':
      return 'LIMITED';
    case 'CONTEXT_ONLY':
    case 'TEMPORARILY_DEGRADED':
      return 'LIMITED';
    case 'PRODUCTION':
      return 'FULL';
    default:
      return 'NOT_ASSESSABLE';
  }
}

export function findCapability(
  capabilities: readonly ResolvedDrivingDetectorCapability[],
  detectorId: DrivingDetectorKey,
): ResolvedDrivingDetectorCapability | undefined {
  return capabilityFor(capabilities, detectorId);
}
