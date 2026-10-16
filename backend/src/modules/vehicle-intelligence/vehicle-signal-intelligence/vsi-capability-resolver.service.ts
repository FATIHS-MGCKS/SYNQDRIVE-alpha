import { Injectable, NotFoundException } from '@nestjs/common';
import { VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION } from './vsi-consumer-requirements.types';
import { resolveVsiCapabilities } from './vsi-capability-resolver.engine';
import { VsiCapabilityResolverRepository } from './vsi-capability-resolver.repository';
import type {
  VsiCapabilityResolverInput,
  VsiCapabilityResolverResultV1,
} from './vsi-capability-resolver.types';

@Injectable()
export class VsiCapabilityResolverService {
  constructor(private readonly repository: VsiCapabilityResolverRepository) {}

  async resolve(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    consumerModule: VsiCapabilityResolverInput['consumerModule'];
    featureId: string;
    requirementsVersion?: typeof VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION;
    evaluationTime?: Date;
  }): Promise<VsiCapabilityResolverResultV1> {
    const evaluationTime = input.evaluationTime ?? new Date();
    const link = await this.repository.loadLinkContext({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
    });
    if (!link) {
      throw new NotFoundException('Provider source link not found');
    }

    const tenantMatch = link.organizationId === input.organizationId;
    const profile = await this.repository.loadProfileContext({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
    });
    const activeSourceLinkCount = await this.repository.countActiveSourceLinks(input.vehicleId);

    const resolverInput: VsiCapabilityResolverInput = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
      consumerModule: input.consumerModule,
      featureId: input.featureId,
      requirementsVersion:
        input.requirementsVersion ?? VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
      evaluationTime,
    };

    return resolveVsiCapabilities(resolverInput, {
      profile,
      linkActive: link.isActive,
      linkSuperseded: link.supersededAt != null,
      tenantMatch,
      activeSourceLinkCount,
    });
  }
}
