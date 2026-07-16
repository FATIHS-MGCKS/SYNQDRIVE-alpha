import type { DrivingDetectorKey } from '../driving-detector-capability/driving-detector-capability.types';
import type { ShadowDetectorResult, ShadowDetectorRunInput } from './shadow-detector.types';

/** Port for HF/signal shadow detector implementations. */
export interface ShadowDetectorImplementation {
  readonly detectorId: DrivingDetectorKey;
  readonly modelVersion: string;
  detect(input: ShadowDetectorRunInput): ShadowDetectorResult | Promise<ShadowDetectorResult>;
}
