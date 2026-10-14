import { VSI03_P2C_VLS_FETCH_ALIGNMENT_TOLERANCE_MS } from './vsi03-p2c.config';
import type {
  VsiLatestStateProvenanceSlice,
  VsiSourceObservationRow,
  VsiStrictSourceAdvanceEvaluation,
} from './vsi-strict-source-advance.types';

function unknown(reasons: string[]): VsiStrictSourceAdvanceEvaluation {
  return {
    classification: 'UNKNOWN',
    strictSourceAdvanced: 'UNKNOWN',
    reasons,
    advanceEvidenceScope: 'NONE',
  };
}

function recordedPairResult(
  partial: Omit<VsiStrictSourceAdvanceEvaluation, 'advanceEvidenceScope'>,
): VsiStrictSourceAdvanceEvaluation {
  return { ...partial, advanceEvidenceScope: 'LATEST_RECORDED_OBSERVATION_PAIR' };
}

function timestampsEqual(a: Date | null | undefined, b: Date | null | undefined): boolean {
  const am = a?.getTime() ?? null;
  const bm = b?.getTime() ?? null;
  if (am == null && bm == null) return true;
  if (am == null || bm == null) return false;
  return am === bm;
}

function withinMs(a: Date, b: Date, toleranceMs: number): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= toleranceMs;
}

function validateLatestStateProvenance(
  latestState: VsiLatestStateProvenanceSlice | null,
): string[] {
  if (!latestState) {
    return ['VLS_PROVENANCE_MISSING'];
  }
  if (!latestState.providerSource?.trim()) {
    return ['VLS_PROVIDER_MISSING'];
  }
  if (!latestState.providerBindingId) {
    return ['VLS_BINDING_MISSING'];
  }
  if (!latestState.providerFetchedAt) {
    return ['VLS_FETCH_TIMESTAMP_MISSING'];
  }
  if (!latestState.sourceTimestamp) {
    return ['VLS_SOURCE_TIMESTAMP_MISSING'];
  }
  return [];
}

/**
 * Compare consecutive durable PROVIDER_FETCH observations at the counter head only.
 * Proves advancement between two recorded observations — not complete poll history or latest actual provider poll.
 */
export function evaluateStrictSourceAdvanceFromObservations(input: {
  scopeProvider: string;
  scopeBindingId: string | null;
  scopeTokenReference: string | null;
  latestState: VsiLatestStateProvenanceSlice | null;
  latest: VsiSourceObservationRow | null;
  previous: VsiSourceObservationRow | null;
  continuityIntact: boolean;
  latestVlsApplicationProven: boolean;
  continuityBlockers?: string[];
}): VsiStrictSourceAdvanceEvaluation {
  const {
    latest,
    previous,
    latestState,
    scopeProvider,
    scopeBindingId,
    scopeTokenReference,
    continuityIntact,
    latestVlsApplicationProven,
    continuityBlockers,
  } = input;

  if (continuityBlockers && continuityBlockers.length > 0) {
    return unknown(continuityBlockers);
  }

  const vlsIssues = validateLatestStateProvenance(latestState);
  if (vlsIssues.length > 0) {
    return unknown(vlsIssues);
  }

  if (!latest) {
    return unknown(['NO_SOURCE_OBSERVATION']);
  }

  if (!previous) {
    return unknown(['INSUFFICIENT_OBSERVATION_HISTORY']);
  }

  if (!continuityIntact) {
    return unknown(['OBSERVATION_CONTINUITY_NOT_PROVEN']);
  }

  if (!latestVlsApplicationProven) {
    return unknown(['LATEST_VLS_APPLICATION_NOT_PROVEN']);
  }

  if (latest.recordPhase !== 'PROVIDER_FETCH' || previous.recordPhase !== 'PROVIDER_FETCH') {
    return unknown(['OBSERVATION_PHASE_INVALID']);
  }

  if (latest.organizationId !== previous.organizationId || latest.vehicleId !== previous.vehicleId) {
    return unknown(['CROSS_VEHICLE_OBSERVATION_SCOPE']);
  }

  if (
    latest.provider !== previous.provider ||
    latest.providerBindingScopeKey !== previous.providerBindingScopeKey ||
    latest.providerTokenScopeKey !== previous.providerTokenScopeKey
  ) {
    return unknown(['OBSERVATION_SCOPE_MISMATCH_BETWEEN_CONSECUTIVE_ROWS']);
  }

  if (latest.provider.toUpperCase() !== scopeProvider.toUpperCase()) {
    return unknown(['PROVIDER_SCOPE_MISMATCH']);
  }

  if (scopeBindingId == null) {
    return unknown(['PROVIDER_BINDING_UNRESOLVED']);
  }

  if (latest.providerBindingId !== scopeBindingId || previous.providerBindingId !== scopeBindingId) {
    return unknown(['PROVIDER_BINDING_MISMATCH']);
  }

  const expectedTokenScope = scopeTokenReference ?? 'NONE';
  if (
    latest.providerTokenScopeKey !== expectedTokenScope ||
    previous.providerTokenScopeKey !== expectedTokenScope
  ) {
    return unknown(['PROVIDER_TOKEN_SCOPE_MISMATCH']);
  }

  const indexGap = latest.observationIndex - previous.observationIndex;
  if (indexGap !== 1n) {
    return unknown(['OBSERVATION_SEQUENCE_GAP']);
  }

  const state = latestState!;

  if (state.providerSource!.trim().toUpperCase() !== latest.provider.toUpperCase()) {
    return unknown(['VLS_PROVIDER_MISMATCH']);
  }
  if (state.providerBindingId !== scopeBindingId) {
    return unknown(['VLS_BINDING_MISMATCH']);
  }
  if (
    !withinMs(
      latest.providerFetchedAt,
      state.providerFetchedAt!,
      VSI03_P2C_VLS_FETCH_ALIGNMENT_TOLERANCE_MS,
    )
  ) {
    return unknown(['LATEST_OBSERVATION_VLS_FETCH_MISMATCH']);
  }

  if (latest.observationOutcome === 'PROVIDER_FETCH_RECORDED') {
    if (!timestampsEqual(latest.providerSourceTimestamp, state.sourceTimestamp)) {
      return unknown(['LATEST_OBSERVATION_VLS_SOURCE_MISMATCH']);
    }
  }

  if (latest.observationOutcome === 'PERSISTENCE_FAILED') {
    return unknown(['LATEST_OBSERVATION_PERSISTENCE_FAILED']);
  }

  const priorTs = previous.providerSourceTimestamp;
  const currentTs = latest.providerSourceTimestamp;
  const priorMs = priorTs?.getTime() ?? null;
  const currentMs = currentTs?.getTime() ?? null;

  if (currentMs == null || priorMs == null) {
    return unknown(['MISSING_PROVIDER_SOURCE_TIMESTAMP']);
  }

  if (!Number.isFinite(priorMs) || !Number.isFinite(currentMs)) {
    return unknown(['INVALID_PROVIDER_SOURCE_TIMESTAMP']);
  }

  if (latest.providerFetchedAt.getTime() < previous.providerFetchedAt.getTime()) {
    return unknown(['OBSERVATION_FETCH_TIME_REGRESSION']);
  }

  if (currentMs < priorMs) {
    return recordedPairResult({
      classification: 'REGRESSION_OR_CONFLICT',
      strictSourceAdvanced: false,
      reasons: ['SOURCE_TIMESTAMP_REGRESSION'],
      latestObservationIndex: latest.observationIndex,
      previousObservationIndex: previous.observationIndex,
    });
  }

  if (currentMs === priorMs) {
    return recordedPairResult({
      classification: 'NOT_ADVANCED',
      strictSourceAdvanced: false,
      reasons: ['SOURCE_TIMESTAMP_UNCHANGED'],
      latestObservationIndex: latest.observationIndex,
      previousObservationIndex: previous.observationIndex,
    });
  }

  return recordedPairResult({
    classification: 'ADVANCED',
    strictSourceAdvanced: true,
    reasons: [],
    latestObservationIndex: latest.observationIndex,
    previousObservationIndex: previous.observationIndex,
  });
}
