import { DrivingEvidenceService } from '../driving-evidence/driving-evidence.service';
import {
  buildShadowDetectorIdempotencyKey,
  buildShadowEvidenceContext,
} from './shadow-detector.contract';
import type { ShadowDetectorPersistInput } from './shadow-detector.types';

/**
 * Persists shadow detector output as append-only DrivingEvidence — never DrivingEvent.
 */
export class ShadowDetectorPersistence {
  constructor(private readonly evidence: DrivingEvidenceService) {}

  async persistResult(input: ShadowDetectorPersistInput) {
    const { result } = input;
    const strength = result.skipped || result.candidateEvents.length === 0 ? 'NONE' : 'LOW';

    return this.evidence.record({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      analysisRunId: input.analysisRunId,
      dimension: 'DRIVER_CONDUCT',
      sourceType: 'ESTIMATED_PROXY',
      strength,
      observedAt: input.observedAt,
      providerSource: 'shadow-detector-framework',
      capabilityVersion: result.capabilityStatus,
      modelVersion: result.modelVersion,
      coverage: result.coverage,
      confidence: result.confidence,
      sourceEntity: {
        table: 'driving_analysis_runs',
        id: input.analysisRunId,
        kind: `shadow_detector:${result.detectorId}`,
      },
      context: buildShadowEvidenceContext(result),
      idempotencyKey: buildShadowDetectorIdempotencyKey(
        input.tripId,
        result.detectorId,
        result.modelVersion,
      ),
    });
  }
}
