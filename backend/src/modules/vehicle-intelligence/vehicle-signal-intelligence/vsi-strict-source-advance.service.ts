import { Injectable } from '@nestjs/common';
import { isVsi03P2cStrictAdvanceReadEnabled } from './vsi03-p2c.config';
import { VsiProviderSourceObservationRepository } from './vsi-provider-source-observation.repository';
import { evaluateStrictSourceAdvanceFromObservations } from './vsi-strict-source-advance.resolver';
import type { VsiStrictSourceAdvanceEvaluation } from './vsi-strict-source-advance.types';

function unknownEvaluation(reasons: string[]): VsiStrictSourceAdvanceEvaluation {
  return {
    classification: 'UNKNOWN',
    strictSourceAdvanced: 'UNKNOWN',
    reasons,
  };
}
import type { VsiLatestStateSnapshot, VsiSourceLinkRow } from './vsi-readonly-composer.types';

@Injectable()
export class VsiStrictSourceAdvanceService {
  constructor(private readonly observations: VsiProviderSourceObservationRepository) {}

  async evaluateForLink(input: {
    organizationId: string;
    vehicleId: string;
    link: VsiSourceLinkRow;
    latestState: VsiLatestStateSnapshot | null;
    dimoTokenReference: string | null;
  }): Promise<VsiStrictSourceAdvanceEvaluation> {
    if (!isVsi03P2cStrictAdvanceReadEnabled()) {
      return unknownEvaluation(['P2C_STRICT_ADVANCE_READ_DISABLED']);
    }

    const provider = input.link.provider?.trim() || 'UNKNOWN';
    const bindingScopeKey = input.link.id === 'UNRESOLVED' ? 'UNRESOLVED' : input.link.id;
    const tokenScopeKey = input.dimoTokenReference ?? 'NONE';

    const rows = await this.observations.loadLatestTwoForScope({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      provider,
      providerBindingScopeKey: bindingScopeKey,
      providerTokenScopeKey: tokenScopeKey,
    });

    const latest = rows[0] ?? null;
    const previous = rows[1] ?? null;

    return evaluateStrictSourceAdvanceFromObservations({
      scopeProvider: provider,
      scopeBindingId: input.link.id === 'UNRESOLVED' ? null : input.link.id,
      scopeTokenReference: input.dimoTokenReference,
      latestState: input.latestState
        ? {
            providerBindingId: input.latestState.providerBindingId,
            providerSource: input.latestState.providerSource,
            sourceTimestamp: input.latestState.sourceTimestamp,
            providerFetchedAt: input.latestState.providerFetchedAt,
          }
        : null,
      latest,
      previous,
    });
  }
}
