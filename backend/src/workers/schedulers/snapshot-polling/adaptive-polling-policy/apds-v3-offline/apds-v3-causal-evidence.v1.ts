import { APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION } from './consumer-demand-registry.v1';
import type { ApdsV3OfflinePolicyInput } from './apds-v3-offline.types';

export type CausalEvidenceVerdict =
  | { ok: true; observationQuality: 'HIGH' | 'LOW' | 'UNKNOWN' }
  | { ok: false; kind: 'NOT_ASSESSABLE' | 'INSUFFICIENT_EVIDENCE'; reason: string };

function isFiniteMs(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v) && !Number.isNaN(v);
}

function notAfterDecision(decisionAtMs: number, ts: number | null): boolean {
  return ts == null || ts <= decisionAtMs;
}

/**
 * Validates causally available evidence at decisionAtMs.
 * Does not assume cross-signal-group timestamp ordering.
 */
export function validateCausalEvidenceAtDecision(
  input: ApdsV3OfflinePolicyInput & {
    lastObservedAtMs?: number | null;
    signalProfileRevisionEffectiveAtMs?: number | null;
    p2cObservationId?: string | null;
  },
): CausalEvidenceVerdict {
  if (!isFiniteMs(input.decisionAtMs)) {
    return { ok: false, kind: 'NOT_ASSESSABLE', reason: 'DECISION_AT_INVALID' };
  }

  const timestamps = [
    input.lastLvProviderSourceMs,
    input.lastProviderFetchedAtMs,
    input.lastTopLevelProviderSourceMs,
    input.lastPhysicalPollMs,
    input.lastObservedAtMs ?? null,
    input.signalProfileRevisionEffectiveAtMs ?? null,
  ];

  for (const ts of timestamps) {
    if (ts != null && (!Number.isFinite(ts) || Number.isNaN(ts))) {
      return { ok: false, kind: 'NOT_ASSESSABLE', reason: 'NON_FINITE_TIMESTAMP' };
    }
    if (ts != null && ts > input.decisionAtMs) {
      return { ok: false, kind: 'INSUFFICIENT_EVIDENCE', reason: 'FUTURE_TIMESTAMP_LEAK' };
    }
  }

  if (input.medianIntervalMs != null && (!Number.isFinite(input.medianIntervalMs) || input.medianIntervalMs <= 0)) {
    return { ok: false, kind: 'NOT_ASSESSABLE', reason: 'MEDIAN_INTERVAL_INVALID' };
  }

  if (input.consumerDemandRevision !== APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION) {
    return { ok: false, kind: 'NOT_ASSESSABLE', reason: 'CONSUMER_REGISTRY_VERSION_MISMATCH' };
  }

  if (!notAfterDecision(input.decisionAtMs, input.lastProviderFetchedAtMs)) {
    return { ok: false, kind: 'INSUFFICIENT_EVIDENCE', reason: 'FETCHED_AT_FUTURE' };
  }

  let observationQuality: 'HIGH' | 'LOW' | 'UNKNOWN' = 'UNKNOWN';
  if (input.signalProfileRevision) {
    const effective = input.signalProfileRevisionEffectiveAtMs;
    if (effective == null || effective > input.decisionAtMs) {
      observationQuality = 'UNKNOWN';
    } else if (input.p2cObservationId) {
      observationQuality = 'HIGH';
    } else {
      observationQuality = 'LOW';
    }
  }

  if (input.p2cTopLevelAdvanceKnown && !input.p2cObservationId) {
    return {
      ok: false,
      kind: 'INSUFFICIENT_EVIDENCE',
      reason: 'P2C_CLAIM_WITHOUT_OBSERVATION_ID',
    };
  }

  if (input.providerSourceLinkId == null && input.sourceLinkInvalidated) {
    return { ok: false, kind: 'NOT_ASSESSABLE', reason: 'SOURCE_LINK_INCOHERENT' };
  }

  return { ok: true, observationQuality };
}
