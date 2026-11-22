import type { ProviderExternalOutcome } from './organization-offboarding-provider-disconnect.service';

export type OrganizationProviderLiveEvidence = {
  attemptedAt: string;
  organizationId: string;
  provider: 'DIMO' | 'HIGH_MOBILITY';
  operations: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
};

export type OrganizationProviderLiveChannelResult = {
  outcome: ProviderExternalOutcome;
  detailCode: string | null;
  providerEvidence: OrganizationProviderLiveEvidence;
};