import type { VsiApdsHistoricalLinkUniquenessResult } from './vsi-apds-historical-link-uniqueness';
import type { VsiApdsP5b1SourceLinkAttributionV1 } from './vsi-apds-p5b1.types';

/**
 * Resolves the provider-source link for offline correlation from historical lifecycle evidence only.
 */
export function resolveOfflineCorrelationSourceLink(input: {
  historical: VsiApdsHistoricalLinkUniquenessResult;
  selectedProviderSourceLinkId?: string | null;
}): VsiApdsP5b1SourceLinkAttributionV1 {
  const reasons = [...input.historical.reasons];
  if (!input.historical.evidenceComplete) {
    return {
      status: 'UNPROVEN',
      providerSourceLinkId: null,
      historicalActiveLinkCountAtDecision: input.historical.historicalActiveLinkCount,
      reasons: [...reasons, 'HISTORICAL_SOURCE_LINK_UNIQUENESS_UNPROVEN'],
    };
  }
  const count = input.historical.historicalActiveLinkCount ?? 0;
  if (count === 0) {
    return {
      status: 'NONE_AT_DECISION',
      providerSourceLinkId: null,
      historicalActiveLinkCountAtDecision: 0,
      reasons: [...reasons, 'NO_HISTORICAL_ACTIVE_SOURCE_LINK_AT_DECISION'],
    };
  }
  if (count > 1) {
    return {
      status: 'AMBIGUOUS',
      providerSourceLinkId: null,
      historicalActiveLinkCountAtDecision: count,
      reasons: [...reasons, 'HISTORICAL_MULTI_ACTIVE_SOURCE_LINKS_AT_DECISION'],
    };
  }
  const soleId = input.historical.historicalActiveLinkIds[0] ?? null;
  if (soleId == null) {
    return {
      status: 'UNPROVEN',
      providerSourceLinkId: null,
      historicalActiveLinkCountAtDecision: 1,
      reasons: [...reasons, 'SOLE_HISTORICAL_LINK_ID_MISSING'],
    };
  }
  if (
    input.selectedProviderSourceLinkId != null &&
    input.selectedProviderSourceLinkId !== soleId
  ) {
    return {
      status: 'AMBIGUOUS',
      providerSourceLinkId: null,
      historicalActiveLinkCountAtDecision: 1,
      reasons: [
        ...reasons,
        'SELECTED_SOURCE_LINK_NOT_UNIQUELY_ATTRIBUTABLE_AT_DECISION',
      ],
    };
  }
  return {
    status: 'UNIQUE_ATTRIBUTED',
    providerSourceLinkId: soleId,
    historicalActiveLinkCountAtDecision: 1,
    reasons,
  };
}
