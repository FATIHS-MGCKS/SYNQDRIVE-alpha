import { Injectable } from '@nestjs/common';
import { VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION } from './vsi-consumer-requirements.types';
import { buildVsiApdsReadonlyCapabilityObservation } from './vsi-apds-readonly.adapter';
import { correlateApdsShadowWithVsiCapability } from './vsi-apds-shadow-correlation.engine';
import type {
  VsiApdsReadonlyAdapterInputV1,
  VsiApdsShadowCorrelationResultV1,
  VsiApdsShadowDecisionSnapshotV1,
} from './vsi-apds-p5.types';
import { VsiCapabilityResolverRepository } from './vsi-capability-resolver.repository';

/**
 * P5A read-only orchestration — no APDS shadow wiring (P5B gate default OFF elsewhere).
 */
@Injectable()
export class VsiApdsP5ReadonlyService {
  constructor(private readonly profiles: VsiCapabilityResolverRepository) {}

  async buildObservation(
    input: Omit<
      VsiApdsReadonlyAdapterInputV1,
      'requirementsContractVersion' | 'policyVersion'
    > & {
      requirementsContractVersion?: typeof VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION;
      policyVersion: string;
      activationEpochId?: string | null;
    },
  ) {
    const adapter: VsiApdsReadonlyAdapterInputV1 = {
      ...input,
      requirementsContractVersion:
        input.requirementsContractVersion ?? VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
    };
    const link = await this.profiles.loadLinkContext({
      organizationId: adapter.organizationId,
      vehicleId: adapter.vehicleId,
      providerSourceLinkId: adapter.providerSourceLinkId,
    });
    const profileBundle = await this.profiles.loadProfileContextWithTemporal({
      organizationId: adapter.organizationId,
      vehicleId: adapter.vehicleId,
      providerSourceLinkId: adapter.providerSourceLinkId,
    });
    const activeSourceLinkCount = await this.profiles.countActiveSourceLinks(adapter.vehicleId);
    const persistedRow = await this.profiles.loadPersistedApdsShadowDecision({
      organizationId: adapter.organizationId,
      vehicleId: adapter.vehicleId,
      opportunityId: adapter.shadowOpportunityId,
      policyVersion: adapter.policyVersion,
    });
    const tenantMatch = link?.organizationId === adapter.organizationId;
    return buildVsiApdsReadonlyCapabilityObservation({
      adapter,
      profile: profileBundle?.profile ?? null,
      profileTemporal: profileBundle?.temporal ?? null,
      trustedProviderIdentity: profileBundle?.trustedProviderIdentity ?? null,
      trustedVerifiedModality: profileBundle?.trustedVerifiedModality ?? null,
      trustedTelemetrySourceFamily: profileBundle?.trustedTelemetrySourceFamily ?? null,
      linkActive: link?.isActive ?? false,
      linkSuperseded: link?.supersededAt != null,
      tenantMatch,
      activeSourceLinkCount,
      persistedShadowDecision: persistedRow
        ? {
            organizationId: persistedRow.organizationId,
            vehicleId: persistedRow.vehicleId,
            opportunityId: persistedRow.opportunityId,
            decisionAt: persistedRow.decisionAt,
            policyVersion: persistedRow.policyVersion,
            activationEpochId: persistedRow.activationEpochId,
            decision: persistedRow.decision,
          }
        : null,
    });
  }

  correlateShadowDecision(input: {
    decision: VsiApdsShadowDecisionSnapshotV1;
    observation: Awaited<ReturnType<typeof buildVsiApdsReadonlyCapabilityObservation>>;
  }): VsiApdsShadowCorrelationResultV1 {
    return correlateApdsShadowWithVsiCapability(input);
  }
}
