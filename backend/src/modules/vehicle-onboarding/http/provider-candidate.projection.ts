import type { SourceClaimProvider } from '../source-adoption/source-claim-lock';
import type { CandidateDisposition } from '../candidate-discovery/provider-candidate-disposition.authority';

export type ProviderCandidateDto = {
  provider: SourceClaimProvider;
  sourceMirrorId: string;
  externalVehicleIdentity: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  disposition: CandidateDisposition;
  resumableCaseId: string | null;
  providerDisplayState: string | null;
};

export type ProviderCandidateListDto = {
  items: ProviderCandidateDto[];
  nextCursor: string | null;
};
