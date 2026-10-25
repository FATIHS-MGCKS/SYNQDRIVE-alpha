/**
 * Scientific baseline poll evidence (WHAT_THE_REAL_BASELINE_POLL_REVEALED).
 * Separate from simulated policy LV state (`realPollVisibleLvSourceAt` admission).
 */

export type TopLevelSourceAdvanceEvidence = 'TRUE_ADVANCE' | 'NO_ADVANCE' | 'UNKNOWN';

export type BaselineLvEvidenceKind =
  | 'STRICT_LV_ADVANCE'
  | 'FIRST_VALID_LV_OBSERVATION'
  | 'NO_ADVANCE'
  | 'UNKNOWN';

export type BaselineLvSourceEvidence =
  | { kind: 'STRICT_LV_ADVANCE'; providerSourceMs: number }
  | { kind: 'FIRST_VALID_LV_OBSERVATION'; providerSourceMs: number }
  | { kind: 'NO_ADVANCE' }
  | { kind: 'UNKNOWN' };

/**
 * Strict LV provider source timestamp from the live payload only
 * (`resolveStrictLvBatteryProviderSourceAt` — valid LV signal observedAt).
 */
export function evaluateBaselineLvSourceEvidence(input: {
  previousLvProviderSourceMs: number | null;
  strictLvProviderSourceMs: number | null;
}): BaselineLvSourceEvidence {
  const next = input.strictLvProviderSourceMs;
  if (next == null || !Number.isFinite(next)) {
    return { kind: 'UNKNOWN' };
  }
  const prev = input.previousLvProviderSourceMs;
  if (prev == null || !Number.isFinite(prev)) {
    return { kind: 'FIRST_VALID_LV_OBSERVATION', providerSourceMs: next };
  }
  if (next > prev) {
    return { kind: 'STRICT_LV_ADVANCE', providerSourceMs: next };
  }
  return { kind: 'NO_ADVANCE' };
}

/** @deprecated use evaluateBaselineLvSourceEvidence */
export function evaluateBaselineLvSourceAdvanceFromPayload(input: {
  previousLvProviderSourceMs: number | null;
  payloadLvProviderSourceMs: number | null;
}): BaselineLvSourceEvidence {
  return evaluateBaselineLvSourceEvidence({
    previousLvProviderSourceMs: input.previousLvProviderSourceMs,
    strictLvProviderSourceMs: input.payloadLvProviderSourceMs,
  });
}

export function baselineLvEvidenceIsSkipInformative(
  evidence: BaselineLvSourceEvidence,
): boolean {
  return evidence.kind === 'STRICT_LV_ADVANCE';
}

/** @deprecated */
export function baselineLvAdvanceIsInformative(
  evidence: BaselineLvSourceEvidence,
): boolean {
  return baselineLvEvidenceIsSkipInformative(evidence);
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

export type BaselineSkipDiscoveryDelayEvidence =
  | {
      kind: 'OBSERVABLE_NEXT_BASELINE_POLL';
      simulatedNextPollAtMs: number;
      additionalDiscoveryDelayMs: number;
      /** Wall-clock when the next baseline poll completed (discovery), not provider source time. */
      simulatedDiscoveryAtMs: number;
    }
  | { kind: 'UNKNOWN' };

export function evaluateBaselineSkipDiscoveryDelay(input: {
  priorPollCompletedAtMs: number;
  nextBaselinePollStartedAtMs: number;
  nextBaselinePollCompletedAtMs: number;
}): BaselineSkipDiscoveryDelayEvidence {
  const delay = input.nextBaselinePollStartedAtMs - input.priorPollCompletedAtMs;
  if (!Number.isFinite(delay) || delay < 0) {
    return { kind: 'UNKNOWN' };
  }
  if (
    input.nextBaselinePollCompletedAtMs < input.nextBaselinePollStartedAtMs
  ) {
    return { kind: 'UNKNOWN' };
  }
  return {
    kind: 'OBSERVABLE_NEXT_BASELINE_POLL',
    simulatedNextPollAtMs: input.nextBaselinePollStartedAtMs,
    additionalDiscoveryDelayMs: delay,
    simulatedDiscoveryAtMs: input.nextBaselinePollCompletedAtMs,
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
