import { isProviderSourceLinkActiveAtDecision } from './vsi-apds-shadow-opportunity-binding';

export type VsiApdsVehicleSourceLinkLifecycleRow = {
  id: string;
  activatedAt: Date;
  deactivatedAt: Date | null;
  supersededByLinkId: string | null;
};

export type VsiApdsHistoricalLinkUniquenessResult = {
  historicalActiveLinkCount: number | null;
  historicalActiveLinkIds: string[];
  evidenceComplete: boolean;
  reasons: string[];
};

/**
 * Counts provider-source links that were active at `decisionAtMs` using lifecycle timestamps only.
 * Does not infer exclusivity from current `isActive` flags.
 */
export const VSI_APDS_MAX_VEHICLE_SOURCE_LINKS_HISTORICAL_ATTRIBUTION = 64;

export function resolveHistoricalActiveSourceLinkUniqueness(input: {
  links: readonly VsiApdsVehicleSourceLinkLifecycleRow[];
  decisionAtMs: number;
  attributionRowLimitExceeded?: boolean;
}): VsiApdsHistoricalLinkUniquenessResult {
  const reasons: string[] = [];
  if (input.attributionRowLimitExceeded) {
    reasons.push('VEHICLE_SOURCE_LINK_ROW_LIMIT_EXCEEDED');
  }
  if (!Number.isFinite(input.decisionAtMs)) {
    return {
      historicalActiveLinkCount: null,
      historicalActiveLinkIds: [],
      evidenceComplete: false,
      reasons: ['INVALID_DECISION_TIMESTAMP_FOR_HISTORICAL_LINK_COUNT'],
    };
  }

  const activeIds: string[] = [];

  for (const link of input.links) {
    const activatedMs = link.activatedAt.getTime();
    if (!Number.isFinite(activatedMs)) {
      reasons.push(`LINK_ACTIVATED_AT_INVALID:${link.id}`);
      continue;
    }
    if (link.supersededByLinkId != null && link.deactivatedAt == null) {
      reasons.push(`LINK_SUPERSESSION_END_TIME_UNKNOWN:${link.id}`);
      continue;
    }

    const supersededAt =
      link.supersededByLinkId != null ? link.deactivatedAt : null;

    if (
      isProviderSourceLinkActiveAtDecision({
        activatedAt: link.activatedAt,
        deactivatedAt: link.deactivatedAt,
        supersededAt,
        decisionAtMs: input.decisionAtMs,
      })
    ) {
      activeIds.push(link.id);
    }
  }

  const evidenceComplete = reasons.length === 0;
  if (!evidenceComplete) {
    return {
      historicalActiveLinkCount: null,
      historicalActiveLinkIds: activeIds,
      evidenceComplete: false,
      reasons: [...reasons, 'HISTORICAL_SOURCE_LINK_UNIQUENESS_UNPROVEN'],
    };
  }

  return {
    historicalActiveLinkCount: activeIds.length,
    historicalActiveLinkIds: activeIds,
    evidenceComplete: true,
    reasons,
  };
}
