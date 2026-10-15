import { createHash } from 'node:crypto';
import type { VsiProfileEvaluationResult } from './vsi-profile.types';

export function fingerprintVsiProfileEvaluation(
  evaluation: VsiProfileEvaluationResult,
): string {
  const payload = {
    contractVersion: evaluation.contractVersion,
    providerSourceLinkId: evaluation.providerSourceLinkId,
    providerIdentity: evaluation.providerIdentity,
    verifiedModality: evaluation.verifiedModality,
    telemetrySourceFamily: evaluation.telemetrySourceFamily,
    lastMaterializedSourceTimestamp: evaluation.lastMaterializedSourceTimestamp?.toISOString() ?? null,
    lastMaterializedProviderFetchAt: evaluation.lastMaterializedProviderFetchAt?.toISOString() ?? null,
    lastProvenStrictSourceAdvanceAt: evaluation.lastProvenStrictSourceAdvanceAt?.toISOString() ?? null,
    signals: evaluation.signals,
    profileLimitations: evaluation.profileLimitations,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
