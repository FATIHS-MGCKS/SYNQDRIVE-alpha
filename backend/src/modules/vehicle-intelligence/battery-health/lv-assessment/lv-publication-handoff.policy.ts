import { buildPublicationJobIdempotencyKey } from '../jobs/battery-v2-job-idempotency.policy';
import { LV_PUBLICATION_CONTRACT_VERSION } from './lv-publication-contract.policy';

export function buildCanonicalLvPublicationHandoffJobKey(input: {
  assessmentId: string;
  publicationVersion?: number;
}): string {
  return buildPublicationJobIdempotencyKey({
    assessmentId: input.assessmentId,
    publicationVersion: input.publicationVersion ?? LV_PUBLICATION_CONTRACT_VERSION,
  });
}

export const LV_PUBLICATION_HANDOFF_RECONCILE_LOOKBACK_MS = 7 * 24 * 3600_000;

export function maxScannedPublicationHandoffCandidates(batch: number): number {
  return Math.max(batch * 4, batch);
}
