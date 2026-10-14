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
  };
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

/**
 * Compare the latest observation against its immediate predecessor by observationIndex.
 * Does not use historical ClickHouse or max(recorded_at) < current semantics.
 */
export function evaluateStrictSourceAdvanceFromObservations(input: {
  scopeProvider: string;
  scopeBindingId: string | null;
  scopeTokenReference: string | null;
  latestState: VsiLatestStateProvenanceSlice | null;
  latest: VsiSourceObservationRow | null;
  previous: VsiSourceObservationRow | null;
}): VsiStrictSourceAdvanceEvaluation {
  const { latest, previous, latestState, scopeProvider, scopeBindingId, scopeTokenReference } =
    input;

  if (!latest) {
    return unknown(['NO_SOURCE_OBSERVATION']);
  }

  if (!previous) {
    return unknown(['INSUFFICIENT_OBSERVATION_HISTORY']);
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

  if (latestState) {
    const providerMatch =
      !latestState.providerSource ||
      latestState.providerSource.toUpperCase() === latest.provider.toUpperCase();
    if (!providerMatch) {
      return unknown(['VLS_PROVIDER_MISMATCH']);
    }
    if (latestState.providerBindingId !== scopeBindingId) {
      return unknown(['VLS_BINDING_MISMATCH']);
    }
    if (
      !withinMs(
        latest.providerFetchedAt,
        latestState.providerFetchedAt ?? latest.providerFetchedAt,
        VSI03_P2C_VLS_FETCH_ALIGNMENT_TOLERANCE_MS,
      )
    ) {
      return unknown(['LATEST_OBSERVATION_VLS_FETCH_MISMATCH']);
    }
    if (latest.observationOutcome === 'VLS_APPLIED') {
      if (!timestampsEqual(latest.providerSourceTimestamp, latestState.sourceTimestamp)) {
        return unknown(['LATEST_OBSERVATION_VLS_SOURCE_MISMATCH']);
      }
    }
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

  if (currentMs < priorMs) {
    return {
      classification: 'REGRESSION_OR_CONFLICT',
      strictSourceAdvanced: false,
      reasons: ['SOURCE_TIMESTAMP_REGRESSION'],
      latestObservationIndex: latest.observationIndex,
      previousObservationIndex: previous.observationIndex,
    };
  }

  if (currentMs === priorMs) {
    return {
      classification: 'NOT_ADVANCED',
      strictSourceAdvanced: false,
      reasons: ['SOURCE_TIMESTAMP_UNCHANGED'],
      latestObservationIndex: latest.observationIndex,
      previousObservationIndex: previous.observationIndex,
    };
  }

  return {
    classification: 'ADVANCED',
    strictSourceAdvanced: true,
    reasons: [],
    latestObservationIndex: latest.observationIndex,
    previousObservationIndex: previous.observationIndex,
  };
}
