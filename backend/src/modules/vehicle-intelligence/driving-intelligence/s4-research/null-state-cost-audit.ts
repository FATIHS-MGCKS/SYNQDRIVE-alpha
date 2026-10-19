export type NullStateAuditRow = {
  bucketLabelUtc: string;
  nullPenaltyCost: number;
  chosenNullCumulativeCost: number;
  bestNonNullCumulativeCost: number | null;
  bestNonNullWayId: number | null;
  cumulativeCostDelta: number | null;
  bestNonNullRouteStatus: string | null;
  classification:
    | 'EVIDENCE_GAP'
    | 'ROUTE_SEARCH_FAILURE'
    | 'COST_MODEL_BIAS'
    | 'TOPOLOGY_INCOMPLETE'
    | 'DP_NULL_LOCALLY_OPTIMAL'
    | 'UNKNOWN';
  notes: string;
};

export function classifyNullDpChoice(params: {
  bucketLabelUtc: string;
  nullPenaltyCost: number;
  chosenNullCumulativeCost: number;
  bestNonNullCumulativeCost: number | null;
  bestNonNullWayId: number | null;
  bestNonNullRouteStatus: string | null;
  candidateCount: number;
}): NullStateAuditRow {
  const {
    bucketLabelUtc,
    nullPenaltyCost,
    chosenNullCumulativeCost,
    bestNonNullCumulativeCost,
    bestNonNullWayId,
    bestNonNullRouteStatus,
    candidateCount,
  } = params;

  let classification: NullStateAuditRow['classification'] = 'UNKNOWN';
  let notes = '';

  if (candidateCount === 0) {
    classification = 'EVIDENCE_GAP';
    notes = 'No emission candidates within search radius.';
  } else if (bestNonNullCumulativeCost == null) {
    classification = 'UNKNOWN';
    notes = 'Only null state reachable in DP layer.';
  } else if (bestNonNullCumulativeCost < chosenNullCumulativeCost) {
    classification = 'COST_MODEL_BIAS';
    notes = 'Non-null DP cumulative cost lower than chosen null layer cost.';
  } else if (bestNonNullRouteStatus === 'ROUTE_NOT_FOUND_IN_EXTRACT' || bestNonNullRouteStatus === 'TOPOLOGY_INCOMPLETE') {
    classification = 'TOPOLOGY_INCOMPLETE';
    notes = 'Best non-null candidate had topology/route-search failure on transition.';
  } else if (bestNonNullRouteStatus === 'DIRECTION_FORBIDDEN') {
    classification = 'ROUTE_SEARCH_FAILURE';
    notes = 'Best non-null candidate transition was direction-forbidden.';
  } else if (bestNonNullCumulativeCost >= chosenNullCumulativeCost) {
    classification = 'DP_NULL_LOCALLY_OPTIMAL';
    notes =
      'Null state cumulative DP cost is not worse than any non-null at this timestep; no single cause asserted.';
  }

  return {
    bucketLabelUtc,
    nullPenaltyCost,
    chosenNullCumulativeCost,
    bestNonNullCumulativeCost,
    bestNonNullWayId,
    cumulativeCostDelta:
      bestNonNullCumulativeCost == null ? null : bestNonNullCumulativeCost - chosenNullCumulativeCost,
    bestNonNullRouteStatus,
    classification,
    notes,
  };
}
