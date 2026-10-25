/**
 * Scientific baseline poll evidence (WHAT_THE_REAL_BASELINE_POLL_REVEALED).
 * Separate from simulated policy LV state (`realPollVisibleLvSourceAt` admission).
 */

export type TopLevelSourceAdvanceEvidence = 'TRUE_ADVANCE' | 'NO_ADVANCE' | 'UNKNOWN';

export type BaselineLvSourceAdvanceEvidence =
  | { kind: 'TRUE_ADVANCE'; providerSourceMs: number }
  | { kind: 'NO_ADVANCE' }
  | { kind: 'UNKNOWN' };

/** Strict provider source-timestamp advance for LIVE_VOLTAGE (payload authority). */
export function evaluateBaselineLvSourceAdvanceFromPayload(input: {
  previousLvProviderSourceMs: number | null;
  payloadLvProviderSourceMs: number | null;
}): BaselineLvSourceAdvanceEvidence {
  const next = input.payloadLvProviderSourceMs;
  if (next == null || !Number.isFinite(next)) {
    return { kind: 'UNKNOWN' };
  }
  const prev = input.previousLvProviderSourceMs;
  if (prev == null) {
    return { kind: 'TRUE_ADVANCE', providerSourceMs: next };
  }
  if (next > prev) {
    return { kind: 'TRUE_ADVANCE', providerSourceMs: next };
  }
  return { kind: 'NO_ADVANCE' };
}

/** Strict provider `sourceTimestamp` advance (vehicle telemetry), not fetch time. */
export function evaluateBaselineTopLevelSourceAdvance(input: {
  previousSourceTimestampMs: number | null | undefined;
  newSourceTimestampMs: number | null | undefined;
}): { evidence: TopLevelSourceAdvanceEvidence; informative: boolean } {
  const next = input.newSourceTimestampMs;
  if (next == null || !Number.isFinite(next)) {
    return { evidence: 'UNKNOWN', informative: false };
  }
  const prev = input.previousSourceTimestampMs;
  if (prev == null || !Number.isFinite(prev)) {
    return { evidence: 'UNKNOWN', informative: false };
  }
  if (next > prev) {
    return { evidence: 'TRUE_ADVANCE', informative: true };
  }
  return { evidence: 'NO_ADVANCE', informative: false };
}

export function baselineLvAdvanceIsInformative(
  evidence: BaselineLvSourceAdvanceEvidence,
): boolean {
  return evidence.kind === 'TRUE_ADVANCE';
}

export type BaselineSkipDiscoveryDelayEvidence =
  | {
      kind: 'OBSERVABLE_NEXT_BASELINE_POLL';
      simulatedNextPollAtMs: number;
      additionalDiscoveryDelayMs: number;
      simulatedDiscoveryAtMs: number | null;
    }
  | { kind: 'UNKNOWN' };

/**
 * Causal discovery delay for a WOULD_SKIP that missed informative baseline evidence.
 * Uses the next actually executed baseline SUCCESS snapshot poll — not cadence estimates.
 */
export function evaluateBaselineSkipDiscoveryDelay(input: {
  pollCompletedAtMs: number;
  informativeLvProviderSourceMs: number | null;
  informativeTopLevelSourceMs: number | null;
  nextBaselineSnapshotPollStartedAtMs: number | null;
}): BaselineSkipDiscoveryDelayEvidence {
  if (input.nextBaselineSnapshotPollStartedAtMs == null) {
    return { kind: 'UNKNOWN' };
  }
  const delay = input.nextBaselineSnapshotPollStartedAtMs - input.pollCompletedAtMs;
  if (!Number.isFinite(delay) || delay < 0) {
    return { kind: 'UNKNOWN' };
  }
  const simulatedDiscoveryAtMs =
    input.informativeLvProviderSourceMs ??
    input.informativeTopLevelSourceMs ??
    null;
  return {
    kind: 'OBSERVABLE_NEXT_BASELINE_POLL',
    simulatedNextPollAtMs: input.nextBaselineSnapshotPollStartedAtMs,
    additionalDiscoveryDelayMs: delay,
    simulatedDiscoveryAtMs,
  };
}

/** Parse `snapshot:<vehicleId>:<iso>` correlation ids from battery provenance. */
export function parseSnapshotCorrelationId(
  correlationId: string | null | undefined,
): { vehicleId: string; fetchedAtMs: number } | null {
  if (!correlationId || !correlationId.startsWith('snapshot:')) {
    return null;
  }
  const parts = correlationId.split(':');
  if (parts.length < 3) return null;
  const vehicleId = parts[1];
  const iso = parts.slice(2).join(':');
  const fetchedAtMs = Date.parse(iso);
  if (!vehicleId || Number.isNaN(fetchedAtMs)) return null;
  return { vehicleId, fetchedAtMs };
}
