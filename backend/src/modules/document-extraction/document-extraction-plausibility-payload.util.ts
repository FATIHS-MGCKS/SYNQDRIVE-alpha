import {
  PIPELINE_PLAUSIBILITY_KEY,
  readPipelinePayload,
} from './document-content-cache.util';
import type { PlausibilityResult } from './document-extraction-plausibility.service';

/**
 * Builds confirm-time plausibility payload from a fresh run only.
 * Preserves `_pipeline` audit/cache but does not reuse prior check results.
 */
export function buildFreshConfirmPlausibilityPayload(
  existing: unknown,
  fresh: PlausibilityResult,
): Record<string, unknown> {
  const pipeline = readPipelinePayload(existing);
  const payload: Record<string, unknown> = {
    overallStatus: fresh.overallStatus,
    checks: fresh.checks,
    recommendedHumanReviewNotes: fresh.recommendedHumanReviewNotes,
  };
  if (Object.keys(pipeline).length > 0) {
    payload[PIPELINE_PLAUSIBILITY_KEY] = pipeline;
  }
  return payload;
}
