import { readRawDtcList, resolveSignalTimestampEvidence } from './vsi-raw-payload-signals.util';
import { VsiEmpiricalObservationStatus } from './vehicle-signal-evidence.contract';
import type { VsiProfileEmpiricalExtraction } from './vsi-profile-empirical-extractor';
import {
  parseConfirmedObdCodesFromHeadJson,
  type ConfirmedObdCodesParseResult,
} from './vsi-vls-obd-dtc-normalize.util';

export type VsiDtcConfirmedCompleteEvidence = {
  providerBindingId: string;
  /** Provider-observed time for obdDTCList (signal source). */
  sourceObservedAt: Date;
  /** Wall-clock fetch / apply observation (distinct from signal source). */
  fetchObservedAt: Date;
  codes: string[];
  codesParse: ConfirmedObdCodesParseResult;
};

/** @deprecated use parseConfirmedObdCodesFromHeadJson */
export function parseConfirmedObdCodesFromHead(json: unknown): string[] {
  const parsed = parseConfirmedObdCodesFromHeadJson(json);
  if (parsed.status === 'valid') return parsed.codes;
  if (parsed.status === 'valid_empty') return [];
  return [];
}

export function resolveVsiMaterializationProjectionAsOf(input: {
  bundleProviderFetchedAt: Date | null;
  bundleUpdatedAt: Date | null;
  dtcConfirmedComplete: VsiDtcConfirmedCompleteEvidence | null;
  materializationWallClock?: Date;
}): Date {
  const wall = input.materializationWallClock ?? new Date();
  const ms = [
    wall.getTime(),
    input.bundleProviderFetchedAt?.getTime(),
    input.bundleUpdatedAt?.getTime(),
    input.dtcConfirmedComplete?.fetchObservedAt.getTime(),
    input.dtcConfirmedComplete?.sourceObservedAt.getTime(),
  ].filter((v): v is number => v != null && Number.isFinite(v));
  return new Date(Math.max(...ms));
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
  /** When set, rejects signal source timestamps after this ceiling (historical as-of). */
  evaluationCeilingMs?: number | null;
}): VsiProfileEmpiricalExtraction {
  const projectionAsOfMs = input.projectionAsOf.getTime();
  const limitations: string[] = [];
  const provenance: Array<'VEHICLE_LATEST_STATE'> = ['VEHICLE_LATEST_STATE'];

  const confirmed =
    input.confirmedComplete &&
    input.confirmedComplete.providerBindingId === input.providerSourceLinkId &&
    (input.confirmedComplete.codesParse.status === 'valid' ||
      input.confirmedComplete.codesParse.status === 'valid_empty')
      ? input.confirmedComplete
      : null;

  if (
    input.confirmedComplete &&
    input.confirmedComplete.providerBindingId === input.providerSourceLinkId &&
    input.confirmedComplete.codesParse.status === 'malformed'
  ) {
    limitations.push('DTC_CONFIRMED_COMPLETE_CODES_MALFORMED');
    return neverObserved(input.nativeSignalName, provenance, limitations);
  }

  const rawDtc = readRawDtcList(input.rawPayloadJson);
  const confirmedSourceMs = confirmed?.sourceObservedAt.getTime() ?? null;
  const rawSourceMs = rawDtc.sourceMs;
  const useConfirmedHead =
    confirmed != null &&
    (!rawDtc.keyPresent ||
      (confirmedSourceMs != null &&
        rawSourceMs != null &&
        confirmedSourceMs >= rawSourceMs) ||
      (confirmedSourceMs != null && rawSourceMs == null));

  if (rawDtc.keyPresent && !useConfirmedHead) {
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

  if (!confirmed) {
    limitations.push('DTC_CONFIRMED_COMPLETE_EVIDENCE_UNAVAILABLE');
    return neverObserved(input.nativeSignalName, provenance, limitations);
  }

  const dtcProjectionMs = Math.max(
    projectionAsOfMs,
    confirmed.fetchObservedAt.getTime(),
    confirmed.sourceObservedAt.getTime(),
  );

  const futureBaselineMs =
    input.evaluationCeilingMs != null ? input.evaluationCeilingMs : dtcProjectionMs;
  if (confirmed.sourceObservedAt.getTime() > futureBaselineMs + 60_000) {
    limitations.push('FUTURE_SIGNAL_TIMESTAMP_REJECTED');
    return neverObserved(input.nativeSignalName, provenance, limitations);
  }

  const codes =
    confirmed.codesParse.status === 'valid'
      ? confirmed.codesParse.codes
      : confirmed.codesParse.status === 'valid_empty'
        ? []
        : [];
  const hasCodes = codes.length > 0;
  const tsEvidence = resolveSignalTimestampEvidence({
    signalSourceMs: confirmed.sourceObservedAt.getTime(),
    projectionAsOfMs: dtcProjectionMs,
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
    confirmedEmptyComplete: confirmed.codesParse.status === 'valid_empty',
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
