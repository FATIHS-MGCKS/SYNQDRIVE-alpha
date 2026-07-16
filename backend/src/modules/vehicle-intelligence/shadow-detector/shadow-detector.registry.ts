import type { DrivingDetectorKey } from '../driving-detector-capability/driving-detector-capability.types';
import { coldEngineLoadShadowDetector } from './detectors/cold-engine-load.shadow-detector';
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
        comparisonWithMisuseCases: null,
        skipped: false,
      };
    },
  };
}

/** Registered shadow detector implementations. */
export const SHADOW_DETECTOR_IMPLEMENTATIONS: readonly ShadowDetectorImplementation[] = [
  coldEngineLoadShadowDetector,
  stubDetector('brake_intensity'),
];

export function getShadowDetectorImplementation(
  detectorId: DrivingDetectorKey,
): ShadowDetectorImplementation | undefined {
  return SHADOW_DETECTOR_IMPLEMENTATIONS.find((impl) => impl.detectorId === detectorId);
}
