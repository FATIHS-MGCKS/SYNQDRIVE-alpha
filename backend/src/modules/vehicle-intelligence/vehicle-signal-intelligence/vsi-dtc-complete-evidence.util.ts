import { readRawDtcList, resolveSignalTimestampEvidence } from './vsi-raw-payload-signals.util';
import { VsiEmpiricalObservationStatus } from './vehicle-signal-evidence.contract';
import type { VsiProfileEmpiricalExtraction } from './vsi-profile-empirical-extractor';

export type VsiDtcConfirmedCompleteEvidence = {
  providerBindingId: string;
  /** Provider-observed time for obdDTCList (signal source). */
  sourceObservedAt: Date;
  /** Wall-clock fetch / apply observation (distinct from signal source). */
  fetchObservedAt: Date;
  codes: string[];
};

export function parseConfirmedObdCodesFromHead(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json.filter((c): c is string => typeof c === 'string' && c.length > 0);
}

/**
 * Resolves diagnostic_trouble_code empirical evidence for VSI materialization.
 * Prefers DIMO bundle raw obdDTCList when present; otherwise uses confirmed-complete
 * DTC source head + VLS operational list (DTC apply path does not mutate bundle JSON).
 */
export function resolveVsiDiagnosticTroubleCodeEmpirical(input: {
  providerSourceLinkId: string;
  nativeSignalName: string;
  rawPayloadJson: unknown;
  obdDtcList: string[] | null | undefined;
  lastDtcSuccessfulCheckAt: Date | null;
  confirmedComplete: VsiDtcConfirmedCompleteEvidence | null;
  projectionAsOf: Date;
}): VsiProfileEmpiricalExtraction {
  const projectionAsOfMs = input.projectionAsOf.getTime();
  const limitations: string[] = [];
  const provenance: Array<'VEHICLE_LATEST_STATE'> = ['VEHICLE_LATEST_STATE'];

  const rawDtc = readRawDtcList(input.rawPayloadJson);
  if (rawDtc.keyPresent) {
    const tsEvidence = resolveSignalTimestampEvidence({
      signalSourceMs: rawDtc.sourceMs,
      projectionAsOfMs,
    });
    limitations.push(...tsEvidence.limitations);
    if (limitations.includes('FUTURE_SIGNAL_TIMESTAMP_REJECTED')) {
      return neverObserved(input.nativeSignalName, provenance, limitations);
    }
    return finalizeDtcExtraction({
      native: input.nativeSignalName,
      hasCodes: rawDtc.hasCodes,
      keyPresent: true,
      confirmedEmptyComplete: rawDtc.keyPresent && !rawDtc.hasCodes,
      tsEvidence,
      fetchAt: input.lastDtcSuccessfulCheckAt,
      provenance,
      limitations,
      evidenceChannel: 'RAW_BUNDLE_OBD_DTC_LIST',
    });
  }

  const confirmed =
    input.confirmedComplete &&
    input.confirmedComplete.providerBindingId === input.providerSourceLinkId
      ? input.confirmedComplete
      : null;

  if (!confirmed) {
    limitations.push('DTC_CONFIRMED_COMPLETE_EVIDENCE_UNAVAILABLE');
    return neverObserved(input.nativeSignalName, provenance, limitations);
  }

  if (
    confirmed.sourceObservedAt.getTime() > projectionAsOfMs + 60_000
  ) {
    limitations.push('FUTURE_SIGNAL_TIMESTAMP_REJECTED');
    return neverObserved(input.nativeSignalName, provenance, limitations);
  }

  const codes = confirmed.codes.length > 0 ? confirmed.codes : (input.obdDtcList ?? []);
  const hasCodes = codes.length > 0;
  const tsEvidence = resolveSignalTimestampEvidence({
    signalSourceMs: confirmed.sourceObservedAt.getTime(),
    projectionAsOfMs,
  });
  limitations.push(...tsEvidence.limitations);
  limitations.push('DTC_EVIDENCE_FROM_CONFIRMED_COMPLETE_SOURCE_HEAD');
  if (limitations.includes('FUTURE_SIGNAL_TIMESTAMP_REJECTED')) {
    return neverObserved(input.nativeSignalName, provenance, limitations);
  }

  const fetchAt = input.lastDtcSuccessfulCheckAt ?? confirmed.fetchObservedAt;

  return finalizeDtcExtraction({
    native: input.nativeSignalName,
    hasCodes,
    keyPresent: true,
    confirmedEmptyComplete: !hasCodes,
    tsEvidence,
    fetchAt,
    provenance,
    limitations,
    evidenceChannel: 'DTC_SOURCE_HEAD_CONFIRMED_COMPLETE',
  });
}

function neverObserved(
  native: string,
  provenance: Array<'VEHICLE_LATEST_STATE'>,
  limitations: string[],
): VsiProfileEmpiricalExtraction {
  return {
    providerNativeSignalName: native,
    empiricalObservation: VsiEmpiricalObservationStatus.NEVER_OBSERVED,
    lastValidObservationAt: null,
    lastSourceTimestamp: null,
    freshnessClassification: 'UNKNOWN',
    evidenceProvenance: provenance,
    limitations,
  };
}

function finalizeDtcExtraction(input: {
  native: string;
  hasCodes: boolean;
  keyPresent: boolean;
  confirmedEmptyComplete: boolean;
  tsEvidence: ReturnType<typeof resolveSignalTimestampEvidence>;
  fetchAt: Date | null;
  provenance: Array<'VEHICLE_LATEST_STATE'>;
  limitations: string[];
  evidenceChannel: string;
}): VsiProfileEmpiricalExtraction {
  const limitations = [...input.limitations, `DTC_EVIDENCE_CHANNEL=${input.evidenceChannel}`];
  if (!input.keyPresent) {
    return neverObserved(input.native, input.provenance, limitations);
  }

  if (input.confirmedEmptyComplete) {
    limitations.push('DTC_CONFIRMED_COMPLETE_EMPTY_LIST');
    return {
      providerNativeSignalName: input.native,
      empiricalObservation: VsiEmpiricalObservationStatus.OBSERVED,
      lastValidObservationAt: input.fetchAt ?? input.tsEvidence.observed,
      lastSourceTimestamp: input.tsEvidence.source,
      freshnessClassification: input.tsEvidence.freshness,
      evidenceProvenance: input.provenance,
      limitations,
    };
  }

  if (!input.hasCodes) {
    return {
      providerNativeSignalName: input.native,
      empiricalObservation: VsiEmpiricalObservationStatus.NEVER_OBSERVED,
      lastValidObservationAt: null,
      lastSourceTimestamp: input.tsEvidence.source,
      freshnessClassification: 'UNKNOWN',
      evidenceProvenance: input.provenance,
      limitations: [...limitations, 'DTC_CODES_ABSENT_WITHOUT_CONFIRMED_EMPTY'],
    };
  }

  return {
    providerNativeSignalName: input.native,
    empiricalObservation: VsiEmpiricalObservationStatus.OBSERVED,
    lastValidObservationAt: input.fetchAt ?? input.tsEvidence.observed,
    lastSourceTimestamp: input.tsEvidence.source,
    freshnessClassification: input.tsEvidence.freshness,
    evidenceProvenance: input.provenance,
    limitations,
  };
}

export function readDiagnosticTroubleCodeLastSourceMsFromProfileSnapshot(
  signalsSnapshot: unknown,
): number | null {
  if (!Array.isArray(signalsSnapshot)) return null;
  for (const raw of signalsSnapshot) {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    if (row.canonicalSignalKey !== 'diagnostic_trouble_code') continue;
    const ts = row.lastSourceTimestamp;
    if (typeof ts !== 'string' || ts.length === 0) return null;
    const ms = Date.parse(ts);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}
