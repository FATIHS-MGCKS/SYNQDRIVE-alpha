import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { parseSourceAdoptionProvider } from './source-adoption-request.validation';
import type { SourceClaimProvider } from '../source-adoption/source-claim-lock';
import { parseListLimitQueryString } from './capture-request.validation';
import {
  decodeProviderCandidateListCursor,
  type ProviderCandidateListCursor,
} from './provider-candidate-list.cursor';

export type ValidatedCandidateListQuery = {
  provider?: SourceClaimProvider;
  limit: number;
  cursor?: ProviderCandidateListCursor;
};

export function parseCandidateListQuery(input: {
  provider?: string;
  limit?: string;
  cursor?: string;
}): ValidatedCandidateListQuery {
  const out: ValidatedCandidateListQuery = { limit: 50 };
  if (input.provider !== undefined && input.provider !== '') {
    out.provider = parseSourceAdoptionProvider(input.provider);
  }
  if (input.limit !== undefined && input.limit !== '') {
    out.limit = parseListLimitQueryString(input.limit);
  }
  if (input.cursor !== undefined && input.cursor !== '') {
    out.cursor = decodeProviderCandidateListCursor(input.cursor, out.provider);
  }
  return out;
}
