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
    input: Omit<VsiApdsReadonlyAdapterInputV1, 'requirementsContractVersion'> & {
      requirementsContractVersion?: typeof VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION;
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
    const profile = await this.profiles.loadProfileContext({
      organizationId: adapter.organizationId,
      vehicleId: adapter.vehicleId,
      providerSourceLinkId: adapter.providerSourceLinkId,
    });
    const tenantMatch = link?.organizationId === adapter.organizationId;
    return buildVsiApdsReadonlyCapabilityObservation({
      adapter,
      profile,
      linkActive: link?.isActive ?? false,
      linkSuperseded: link?.supersededAt != null,
      tenantMatch,
    });
  }

  correlateShadowDecision(input: {
    decision: VsiApdsShadowDecisionSnapshotV1;
    observation: Awaited<ReturnType<typeof buildVsiApdsReadonlyCapabilityObservation>>;
  }): VsiApdsShadowCorrelationResultV1 {
    return correlateApdsShadowWithVsiCapability(input);
  }
}
