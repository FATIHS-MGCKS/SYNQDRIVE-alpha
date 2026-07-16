import type { DrivingDetectorSupportStatus } from '../driving-detector-capability/driving-detector-capability.types';
import { canExecuteShadowDetector } from './shadow-detector.contract';
import type { ShadowDetectorCapabilitySnapshot } from './shadow-detector.types';

export type CadenceCoveragePolicy = {
  maxEffectiveCadenceMs: number;
  minCoverage: number;
  minHfSamples: number;
};

export function assessCadenceCoverageGate(input: {
  effectiveCadenceMs: number | null;
  coverage: number | null;
  sampleCount: number;
  capabilityCadenceMs: number | null;
  capabilityCoverage: number | null;
  policy: CadenceCoveragePolicy;
}): { passed: boolean; rejectionReasons: string[] } {
  const rejectionReasons: string[] = [];
  const cadence = input.capabilityCadenceMs ?? input.effectiveCadenceMs;
  const coverage = input.capabilityCoverage ?? input.coverage;

  if (input.sampleCount < input.policy.minHfSamples) {
    rejectionReasons.push('INSUFFICIENT_HF_SAMPLES');
  }
  if (cadence != null && cadence > input.policy.maxEffectiveCadenceMs) {
    rejectionReasons.push('CADENCE_TOO_SPARSE');
  }
  if (coverage != null && coverage < input.policy.minCoverage) {
    rejectionReasons.push('COVERAGE_BELOW_MINIMUM');
  }

  return { passed: rejectionReasons.length === 0, rejectionReasons };
}

export function assessDetectorCapabilityGate(input: {
  capability: ShadowDetectorCapabilitySnapshot | null | undefined;
  requiredSignals?: readonly string[];
}): { passed: boolean; rejectionReasons: string[]; status: DrivingDetectorSupportStatus | null } {
  if (!input.capability) {
    return {
      passed: false,
      rejectionReasons: ['NO_DETECTOR_CAPABILITY'],
      status: null,
    };
  }

  const rejectionReasons: string[] = [];
  if (!canExecuteShadowDetector(input.capability.status)) {
    rejectionReasons.push('CAPABILITY_NOT_EXECUTABLE');
  }

  for (const signal of input.requiredSignals ?? []) {
    if (input.capability.missingRequirements.includes(signal)) {
      rejectionReasons.push(`MISSING_SIGNAL:${signal}`);
    }
  }

  return {
    passed: rejectionReasons.length === 0,
    rejectionReasons,
    status: input.capability.status,
  };
}

export function assessSynchronyGate(input: {
  syncDeltaMs: number | null;
  maxSyncDeltaMs: number;
}): { passed: boolean; rejectionReasons: string[] } {
  if (input.syncDeltaMs == null) {
    return { passed: true, rejectionReasons: [] };
  }
  if (input.syncDeltaMs > input.maxSyncDeltaMs) {
    return { passed: false, rejectionReasons: ['SIGNAL_SYNC_OUT_OF_RANGE'] };
  }
  return { passed: true, rejectionReasons: [] };
}
