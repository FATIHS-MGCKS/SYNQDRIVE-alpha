import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { parseSourceAdoptionProvider } from './source-adoption-request.validation';
import type { SourceClaimProvider } from '../source-adoption/source-claim-lock';
import { parseListLimitQueryString } from './capture-request.validation';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ValidatedCandidateListQuery = {
  provider?: SourceClaimProvider;
  limit: number;
  cursor?: string;
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
    if (!UUID_RE.test(input.cursor)) {
      throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid cursor');
    }
    out.cursor = input.cursor;
  }
  return out;
}
