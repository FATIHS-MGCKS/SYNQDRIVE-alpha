import type { DrivingDetectorKey } from '../driving-detector-capability/driving-detector-capability.types';
import type { ShadowDetectorImplementation } from './shadow-detector.port';
import type { ShadowDetectorResult, ShadowDetectorRunInput } from './shadow-detector.types';

const STUB_MODEL_VERSION = 'shadow-detector-stub-v1';

function stubDetector(detectorId: DrivingDetectorKey): ShadowDetectorImplementation {
  return {
    detectorId,
    modelVersion: STUB_MODEL_VERSION,
    detect(input: ShadowDetectorRunInput): ShadowDetectorResult {
      return {
        detectorId,
        modelVersion: STUB_MODEL_VERSION,
        capabilityStatus: 'SHADOW',
        assessability: 'LIMITED',
        candidateEvents: [],
        context: {
          stub: true,
          tripId: input.tripId,
          frameworkVersion: input.frameworkVersion,
        },
        confidence: 0.2,
        coverage: 0,
        rejectionReasons: [],
        comparisonWithNativeEvents: null,
        skipped: false,
      };
    },
  };
}

/** Registered shadow detector implementations — extend per detector in later prompts. */
export const SHADOW_DETECTOR_IMPLEMENTATIONS: readonly ShadowDetectorImplementation[] = [
  stubDetector('cold_engine_load'),
  stubDetector('brake_intensity'),
];

export function getShadowDetectorImplementation(
  detectorId: DrivingDetectorKey,
): ShadowDetectorImplementation | undefined {
  return SHADOW_DETECTOR_IMPLEMENTATIONS.find((impl) => impl.detectorId === detectorId);
}
