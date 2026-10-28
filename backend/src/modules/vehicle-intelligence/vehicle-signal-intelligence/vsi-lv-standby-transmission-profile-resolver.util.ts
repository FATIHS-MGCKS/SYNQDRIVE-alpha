import type { VsiSignalConfidenceLevel } from './vsi-profile.types';
import { buildCadenceSemanticFingerprint } from './vsi-profile-cadence-stats.util';
import type {
  VsiLvStandbyTransmissionEvidenceInput,
  VsiLvStandbyTransmissionProfileLabel,
  VsiLvStandbyTransmissionProfileV1,
  VsiRpmCadenceTripWindow,
  VsiSignalCadenceIntelligenceV2,
} from './vsi-profile-cadence.types';

export const VSI_LV_STANDBY_TRANSMISSION_PROFILE_CONTRACT_VERSION =
  'vsi-lv-standby-transmission-profile-v1' as const;

/** Research window aligned with production forensics (M3.3B / gap investigation). */
export const VSI_LV_STANDBY_EVIDENCE_WINDOW_DAYS = 30;

export const VSI_LV_STANDBY_8H_GAP_MIN_SECONDS = 6 * 3600;
export const VSI_LV_STANDBY_8H_GAP_MAX_SECONDS = 10 * 3600;
export const VSI_LV_STANDBY_16H_GAP_MIN_SECONDS = 14 * 3600;
export const VSI_LV_STANDBY_16H_GAP_MAX_SECONDS = 18 * 3600;
export const VSI_LV_STANDBY_24H_GAP_MIN_SECONDS = 22 * 3600;
export const VSI_LV_STANDBY_24H_GAP_MAX_SECONDS = 26 * 3600;

export const VSI_LV_STANDBY_MIN_INDEPENDENT_REST_PERIODS_8H = 3;
export const VSI_LV_STANDBY_MIN_QUALIFYING_PAIRS_8H = 4;
export const VSI_LV_STANDBY_MIN_INDEPENDENT_REST_PERIODS_24H = 3;
export const VSI_LV_STANDBY_MIN_QUALIFYING_PAIRS_24H = 3;

const ELIGIBLE_OUTCOMES = new Set(['NEW_OBSERVATION']);

export type LvStandbyGapBand = '8H' | '16H' | '24H' | 'OTHER';

export type LvStandbyQualifyingPair = {
  providerTimestampMsA: number;
  providerTimestampMsB: number;
  gapSeconds: number;
  gapBand: LvStandbyGapBand;
  restPeriodIndex: number;
};

function classifyGapBand(gapSeconds: number): LvStandbyGapBand {
  if (
    gapSeconds >= VSI_LV_STANDBY_8H_GAP_MIN_SECONDS &&
    gapSeconds <= VSI_LV_STANDBY_8H_GAP_MAX_SECONDS
  ) {
    return '8H';
  }
  if (
    gapSeconds >= VSI_LV_STANDBY_16H_GAP_MIN_SECONDS &&
    gapSeconds <= VSI_LV_STANDBY_16H_GAP_MAX_SECONDS
  ) {
    return '16H';
  }
  if (
    gapSeconds >= VSI_LV_STANDBY_24H_GAP_MIN_SECONDS &&
    gapSeconds <= VSI_LV_STANDBY_24H_GAP_MAX_SECONDS
  ) {
    return '24H';
  }
  return 'OTHER';
}

function isProviderTimeDuringTrip(
  providerTimestampMs: number,
  trips: readonly VsiRpmCadenceTripWindow[],
): boolean {
  for (const trip of trips) {
    if (providerTimestampMs >= trip.startMs && providerTimestampMs <= trip.endMs) {
      return true;
    }
  }
  return false;
}

/** Any completed trip activity strictly between provider advances (no cross-trip pairing). */
function tripBlocksOpenInterval(
  providerTimestampMsA: number,
  providerTimestampMsB: number,
  trips: readonly VsiRpmCadenceTripWindow[],
): boolean {
  const lo = Math.min(providerTimestampMsA, providerTimestampMsB);
  const hi = Math.max(providerTimestampMsA, providerTimestampMsB);
  for (const trip of trips) {
    if (trip.startMs < hi && trip.endMs > lo) {
      return true;
    }
  }
  return false;
}

export function isEligibleLvStandbySourceAdvance(outcome: string | null | undefined): boolean {
  if (outcome == null) {
    return false;
  }
  return ELIGIBLE_OUTCOMES.has(outcome);
}

export function evaluateLvStandbyTransmissionPair(input: {
  earlierProviderTimestampMs: number;
  laterProviderTimestampMs: number;
  earlierOutcome: string | null;
  laterOutcome: string | null;
  trips: readonly VsiRpmCadenceTripWindow[];
}): { eligible: boolean; rejectionCode: string; gapBand: LvStandbyGapBand; gapSeconds: number } {
  const gapSeconds = (input.laterProviderTimestampMs - input.earlierProviderTimestampMs) / 1000;
  const gapBand = classifyGapBand(gapSeconds);
  if (gapSeconds <= 0) {
    return { eligible: false, rejectionCode: 'NON_POSITIVE_GAP', gapBand, gapSeconds };
  }
  if (
    !isEligibleLvStandbySourceAdvance(input.earlierOutcome) ||
    !isEligibleLvStandbySourceAdvance(input.laterOutcome)
  ) {
    return { eligible: false, rejectionCode: 'SOURCE_ADVANCE_NOT_VERIFIED', gapBand, gapSeconds };
  }
  if (
    isProviderTimeDuringTrip(input.earlierProviderTimestampMs, input.trips) ||
    isProviderTimeDuringTrip(input.laterProviderTimestampMs, input.trips)
  ) {
    return { eligible: false, rejectionCode: 'PROVIDER_TIME_DURING_TRIP', gapBand, gapSeconds };
  }
  if (
    tripBlocksOpenInterval(
      input.earlierProviderTimestampMs,
      input.laterProviderTimestampMs,
      input.trips,
    )
  ) {
    return { eligible: false, rejectionCode: 'TRIP_CROSSES_INTERVAL', gapBand, gapSeconds };
  }
  if (gapBand === 'OTHER') {
    return { eligible: false, rejectionCode: 'GAP_OUTSIDE_LADDER_BANDS', gapBand, gapSeconds };
  }
  return { eligible: true, rejectionCode: 'QUALIFYING_STANDBY_PAIR', gapBand, gapSeconds };
}

function assignRestPeriodIndices(
  pairs: LvStandbyQualifyingPair[],
  trips: readonly VsiRpmCadenceTripWindow[],
): LvStandbyQualifyingPair[] {
  if (pairs.length === 0) {
    return pairs;
  }
  const sorted = [...pairs].sort(
    (a, b) => a.providerTimestampMsA - b.providerTimestampMsA,
  );
  let periodIndex = 0;
  let lastEnd = sorted[0]!.providerTimestampMsB;
  const out: LvStandbyQualifyingPair[] = [{ ...sorted[0]!, restPeriodIndex: 0 }];
  for (let i = 1; i < sorted.length; i++) {
    const pair = sorted[i]!;
    const blocked = trips.some(
      (t) => t.startMs < pair.providerTimestampMsB && t.endMs > lastEnd,
    );
    if (blocked || pair.providerTimestampMsA - lastEnd > 48 * 3600 * 1000) {
      periodIndex += 1;
    }
    out.push({ ...pair, restPeriodIndex: periodIndex });
    lastEnd = Math.max(lastEnd, pair.providerTimestampMsB);
  }
  return out;
}

function countDistinctRestPeriods(pairs: LvStandbyQualifyingPair[]): number {
  if (pairs.length === 0) {
    return 0;
  }
  return new Set(pairs.map((p) => p.restPeriodIndex)).size;
}

function resolveEvidenceConfidence(
  independentRestPeriods: number,
  qualifyingPairs: number,
): VsiSignalConfidenceLevel {
  if (independentRestPeriods >= 4 && qualifyingPairs >= 6) {
    return 'HIGH';
  }
  if (independentRestPeriods >= 3 && qualifyingPairs >= 4) {
    return 'MEDIUM';
  }
  if (qualifyingPairs >= 1) {
    return 'LOW';
  }
  return 'LOW';
}

export function buildLvStandbyTransmissionProfileSemanticFingerprint(input: {
  profile: VsiLvStandbyTransmissionProfileLabel;
}): string {
  return buildCadenceSemanticFingerprint({
    contract: VSI_LV_STANDBY_TRANSMISSION_PROFILE_CONTRACT_VERSION,
    lvStandbyProfile: input.profile,
  });
}

export function resolveLvStandbyTransmissionProfileV1(
  evidence: VsiLvStandbyTransmissionEvidenceInput,
): VsiLvStandbyTransmissionProfileV1 {
  const limitations = [
    'OBSERVED_STANDBY_TRANSMISSION_CADENCE_NOT_NATIVE_DEVICE_CONFIGURATION',
    'INGEST_TIME_MEASUREMENT_CONTEXT_NOT_USED_FOR_PROVIDER_TIME_CLASSIFICATION',
    'MISSING_INTERMEDIATE_LV_SAMPLES_NOT_24H_DEVICE_PROOF',
  ];
  const linkEnd = evidence.linkDeactivatedAtMs ?? Number.POSITIVE_INFINITY;
  const scoped = evidence.points.filter(
    (p) =>
      p.providerTimestampMs >= evidence.linkActivatedAtMs &&
      p.providerTimestampMs <= linkEnd &&
      p.providerTimestampMs >= evidence.windowStartMs &&
      p.providerTimestampMs <= evidence.windowEndMs,
  );

  const byProvider = new Map<number, (typeof scoped)[number]>();
  for (const point of scoped) {
    if (!isEligibleLvStandbySourceAdvance(point.providerObservationOutcome)) {
      continue;
    }
    if (!byProvider.has(point.providerTimestampMs)) {
      byProvider.set(point.providerTimestampMs, point);
    }
  }
  const chronological = [...byProvider.values()].sort(
    (a, b) => a.providerTimestampMs - b.providerTimestampMs,
  );

  const qualifying: LvStandbyQualifyingPair[] = [];
  for (let i = 1; i < chronological.length; i++) {
    const earlier = chronological[i - 1]!;
    const later = chronological[i]!;
    const evalResult = evaluateLvStandbyTransmissionPair({
      earlierProviderTimestampMs: earlier.providerTimestampMs,
      laterProviderTimestampMs: later.providerTimestampMs,
      earlierOutcome: earlier.providerObservationOutcome,
      laterOutcome: later.providerObservationOutcome,
      trips: evidence.tripWindows,
    });
    if (!evalResult.eligible) {
      continue;
    }
    qualifying.push({
      providerTimestampMsA: earlier.providerTimestampMs,
      providerTimestampMsB: later.providerTimestampMs,
      gapSeconds: evalResult.gapSeconds,
      gapBand: evalResult.gapBand,
      restPeriodIndex: 0,
    });
  }

  const withPeriods = assignRestPeriodIndices(qualifying, evidence.tripWindows);
  const independentRestPeriodCount = countDistinctRestPeriods(withPeriods);
  const qualifyingPairCount = withPeriods.length;
  const band8 = withPeriods.filter((p) => p.gapBand === '8H');
  const band24 = withPeriods.filter((p) => p.gapBand === '24H');
  const band16 = withPeriods.filter((p) => p.gapBand === '16H');
  const restPeriodsWith8h = new Set(band8.map((p) => p.restPeriodIndex)).size;
  const restPeriodsWith24h = new Set(band24.map((p) => p.restPeriodIndex)).size;

  let profile: VsiLvStandbyTransmissionProfileLabel = 'UNKNOWN';
  let classificationDecisionCode = 'INSUFFICIENT_STANDBY_EVIDENCE';

  const meets8h =
    band8.length >= VSI_LV_STANDBY_MIN_QUALIFYING_PAIRS_8H &&
    restPeriodsWith8h >= VSI_LV_STANDBY_MIN_INDEPENDENT_REST_PERIODS_8H &&
    band8.length >= band24.length;

  const meets24h =
    band24.length >= VSI_LV_STANDBY_MIN_QUALIFYING_PAIRS_24H &&
    restPeriodsWith24h >= VSI_LV_STANDBY_MIN_INDEPENDENT_REST_PERIODS_24H &&
    band24.length > band8.length;

  if (meets8h && meets24h) {
    profile = 'UNKNOWN';
    classificationDecisionCode = 'CONTRADICTORY_8H_AND_24H_EVIDENCE';
  } else if (meets8h) {
    profile = 'LV_8H_OBSERVED';
    classificationDecisionCode = 'REPEATED_8H_STANDBY_SOURCE_ADVANCES';
  } else if (meets24h) {
    profile = 'LV_24H_OBSERVED';
    classificationDecisionCode = 'REPEATED_24H_STANDBY_SOURCE_ADVANCES';
  } else if (qualifyingPairCount > 0 && band16.length >= band8.length) {
    classificationDecisionCode = '16H_LADDER_ONLY_NOT_8H_PROFILE';
  } else if (qualifyingPairCount > 0) {
    classificationDecisionCode = 'STANDBY_PAIRS_BELOW_STABILITY_THRESHOLD';
  }

  if (band8.length > 0 && band8.length < VSI_LV_STANDBY_MIN_QUALIFYING_PAIRS_8H) {
    limitations.push('SINGLE_OR_SPARSE_8H_GAPS_NOT_PROFILE_PROMOTION');
  }

  const evidenceConfidence = resolveEvidenceConfidence(
    independentRestPeriodCount,
    qualifyingPairCount,
  );

  const resolution: VsiLvStandbyTransmissionProfileV1 = {
    contractVersion: VSI_LV_STANDBY_TRANSMISSION_PROFILE_CONTRACT_VERSION,
    profile,
    classificationDecisionCode,
    evidenceConfidence,
    qualifyingPairCount,
    independentRestPeriodCount,
    evidenceWindow: {
      days: evidence.evidenceWindowDays,
      fromMs: evidence.windowStartMs,
      toMs: evidence.windowEndMs,
    },
    provenance: [...evidence.provenance],
    limitations,
    profileSemanticFingerprint: buildLvStandbyTransmissionProfileSemanticFingerprint({
      profile,
    }),
  };

  return resolution;
}

export function mergeLvStandbyTransmissionProfileOntoLvCadence(
  cadence: VsiSignalCadenceIntelligenceV2,
  standby: VsiLvStandbyTransmissionProfileV1 | null,
): VsiSignalCadenceIntelligenceV2 {
  if (!standby) {
    return cadence;
  }

  const limitations = [...cadence.limitations, ...standby.limitations];

  const cadenceSemanticFingerprint = buildCadenceSemanticFingerprint({
    signal: 'lv_voltage',
    median: cadence.intervalMedianSeconds,
    p95: cadence.intervalP95Seconds,
    maxGap: cadence.maxIntraWindowGapSeconds,
    lvStandbyProfile: standby.profile,
    regimes: cadence.regimes.map((r) => ({
      kind: r.kind,
      median: r.intervalMedianSeconds,
      p95: r.intervalP95Seconds,
      confidence: r.confidence,
    })),
  });

  return {
    ...cadence,
    limitations: [...new Set(limitations)],
    lvStandbyTransmissionProfile: standby,
    cadenceSemanticFingerprint,
  };
}
