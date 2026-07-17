import { readBookingCandidatePipelineState } from './booking-candidate-matching.util';
import { readCustomerCandidatePipelineState } from './customer-candidate-matching.util';
import { readDriverCandidatePipelineState } from './driver-candidate-matching.util';
import { collectRankingInputItems } from './entity-candidate-ranking.adapters';
import { applyEntityCandidateRankingPolicy } from './entity-candidate-ranking.policy';
import type { EntityCandidateRankingPipelineState } from './entity-candidate-ranking.types';
import { readPartnerCandidatePipelineState } from './partner-candidate-matching.util';
import { readVehicleCandidatePipelineState } from './vehicle-candidate-matching.util';
import type { PipelinePlausibilityPayload } from './document-content-cache.util';

export function buildEntityCandidateRankingFromPipeline(input: {
  documentType: string;
  plausibility: unknown;
  uploadContextResolverStatus?: 'PENDING' | 'ALIGNED' | 'CONFLICT' | 'NO_SIGNAL' | null;
}): EntityCandidateRankingPipelineState {
  const vehicleState = readVehicleCandidatePipelineState(input.plausibility);
  const bookingState = readBookingCandidatePipelineState(input.plausibility);
  const customerState = readCustomerCandidatePipelineState(input.plausibility);
  const driverState = readDriverCandidatePipelineState(input.plausibility);
  const partnerState = readPartnerCandidatePipelineState(input.plausibility);

  return applyEntityCandidateRankingPolicy({
    documentType: input.documentType,
    uploadContextResolverStatus: input.uploadContextResolverStatus ?? null,
    items: collectRankingInputItems({
      vehicleCandidates: vehicleState?.candidates,
      bookingCandidates: bookingState?.candidates,
      customerCandidates: customerState?.candidates,
      driverCandidates: driverState?.candidates,
      partnerCandidates: partnerState?.candidates,
    }),
  });
}

export function mergeEntityRankingIntoPipeline(
  pipeline: PipelinePlausibilityPayload,
  ranking: EntityCandidateRankingPipelineState,
): PipelinePlausibilityPayload {
  return {
    ...pipeline,
    entityCandidateRanking: ranking,
  };
}
