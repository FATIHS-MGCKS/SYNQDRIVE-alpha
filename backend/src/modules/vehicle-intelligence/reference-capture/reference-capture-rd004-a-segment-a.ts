/**
 * RD004-A — Segment A video ↔ telemetry alignment (read-only analysis).
 * Does NOT modify production score, detectors, tire/brake runtime, or RD003 evidence.
 */
import * as crypto from 'crypto';
import {
  analyzeSignalGroup,
  computeProviderCadence,
  extractNumericValue,
  percentile,
  uniqueProviderTimestamps,
} from './reference-capture-signal-metrics';
import type { VideoGtExportedRow } from './reference-capture-rd003-video-gt-export';
import {
  ACQUISITION_SURFACES,
  detectStaleHolds,
  stableStringify,
} from './reference-capture-rd003-video-gt-alignment';
import { dedupePhysicalSamples } from './reference-capture-rd003-video-gt-global-discovery-v2';
import {
  identifyStaleHoldDuplicateRows,
  rowsForPhysicalCadenceAnalysis,
  computePhysicalCadenceMetrics,
} from './reference-capture-rd003-signal-quality';
import { preprocessHighFrequency, type CleanHfPoint } from '../trips/hf-preprocessing';
import { detectAccelerationEvents } from '../trips/hf-acceleration';
import { detectBrakingEvents } from '../trips/hf-braking';
import { detectAbuseEvents } from '../trips/hf-abuse';

export const RD004_A_PHASE = 'RD004-A';
export const RD004_A_EVIDENCE_ID = 'DI-EV-0035A';
export const RD004_A_MODE = 'RD004_SEGMENT_A_VIDEO_TELEMETRY_ALIGNMENT';

export const SEGMENT_A_CONSTANTS = {
  vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
  tokenId: 187336,
  sessionId: 'f1e81e78-f96b-44ee-80c2-ca5270f21248',
  referenceDriveId: 'DIMO_LTE_R1_REFERENCE_DRIVE_004',
  vehicleLabel: 'KS MX 2024 Mercedes-Benz C 63 AMG',
  videoStartUtc: '2026-09-04T03:37:46.000Z',
  videoEndUtc: '2026-09-04T03:43:56.650Z',
  videoDurationSeconds: 370.65,
  queryEnvelopeStartUtc: '2026-09-04T03:37:00.000Z',
  queryEnvelopeEndUtc: '2026-09-04T03:45:00.000Z',
  independentClockAnchorUtc: '2026-09-04T03:37:46.000Z',
  timeIsClockDifferenceSeconds: -0.065,
  timeIsUncertaintySeconds: 0.108,
  sealedEvidenceSha256: '5938b9e9120864768dd91048fb06a182ef2b7f0772a9a2df2c75f17cb684d2e2',
} as const;

export const SEGMENT_A_SIGNALS = [
  'speed',
  'powertrainCombustionEngineSpeed',
  'obdThrottlePosition',
  'powertrainCombustionEngineTPS',
  'obdEngineLoad',
  'powertrainTransmissionActualGear',
  'powertrainTransmissionActualGearRatio',
] as const;

export const PROVISIONAL_ACCELERATION_MAX_GAP_SECONDS = 2.0;

export type Rd004ObservationRow = VideoGtExportedRow & {
  id?: string;
  observationKind?: string;
};

export type LegacyPreprocessedSpeedRow = {
  providerTimestamp: string;
  qualifiedRawHfSpeedKmh: number;
  legacy3PointSmoothedSpeedKmh: number;
};

export type QualifiedSpeedPoint = {
  acquisitionOrdinal: number;
  providerTimestamp: string;
  speedKmh: number;
  videoRelativeSecondsProvisional: number;
  flags: string[];
};

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function mad(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const median = percentile(sorted, 50);
  if (median == null) return null;
  const deviations = values.map((v) => Math.abs(v - median));
  return percentile(deviations.sort((a, b) => a - b), 50);
}

export function loadRd004Jsonl(content: string): Rd004ObservationRow[] {
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Rd004ObservationRow);
}

export function filterRowsByProviderTimestampEnvelope(
  rows: Rd004ObservationRow[],
  startUtc: string,
  endUtc: string,
): Rd004ObservationRow[] {
  const startMs = Date.parse(startUtc);
  const endMs = Date.parse(endUtc);
  return rows.filter((row) => {
    const t = parseMs(row.providerTimestamp);
    return t != null && t >= startMs && t <= endMs;
  });
}

export function analyzeSignalCadenceForField(
  rows: Rd004ObservationRow[],
  field: string,
  surface: string,
) {
  const subset = rows.filter((r) => r.providerField === field && r.acquisitionSurface === surface);
  if (!subset.length) {
    return {
      field,
      acquisitionSurface: surface,
      rowCount: 0,
      status: 'NOT_OBSERVED',
    };
  }
  const physical = rowsForPhysicalCadenceAnalysis(subset);
  const cadence = computePhysicalCadenceMetrics(subset);
  const staleDupes = identifyStaleHoldDuplicateRows(subset);
  const metrics = analyzeSignalGroup(
    subset.map((r) => ({
      observationKind: 'SIGNAL_POINT',
      providerField: r.providerField,
      acquisitionSurface: r.acquisitionSurface,
      providerTimestamp: r.providerTimestamp,
      synqReceivedAt: r.synqReceivedAt,
      requestStartedAt: r.requestStartedAt,
      requestCompletedAt: r.requestCompletedAt,
      sequenceNumber: r.sequenceNumber,
      physicalSampleFingerprint: r.physicalSampleFingerprint,
      rawValueJson: r.rawValueJson,
      createdAt: r.createdAt ?? r.synqReceivedAt,
    })),
  );
  return {
    field,
    acquisitionSurface: surface,
    rowCount: subset.length,
    firstProviderTimestamp: subset.map((r) => r.providerTimestamp).sort()[0] ?? null,
    lastProviderTimestamp: subset.map((r) => r.providerTimestamp).sort().at(-1) ?? null,
    uniquePhysicalSampleCount: cadence.UNIQUE_PHYSICAL_SAMPLE_COUNT,
    duplicateCount: staleDupes.size,
    staleHoldCount: detectStaleHolds(subset).length,
    outOfOrderCount: metrics.outOfOrder.outOfOrderCount,
    medianPhysicalCadenceSeconds: cadence.NEW_PHYSICAL_SAMPLE_CADENCE_MEDIAN_SECONDS,
    p10PhysicalCadenceSeconds: cadence.NEW_PHYSICAL_SAMPLE_CADENCE_P10_SECONDS,
    p90PhysicalCadenceSeconds: cadence.NEW_PHYSICAL_SAMPLE_CADENCE_P90_SECONDS,
    maxGapSeconds: cadence.NEW_PHYSICAL_SAMPLE_CADENCE_MAX_GAP_SECONDS,
    status: 'OBSERVED',
  };
}

export function buildQualifiedHfSpeedSeries(
  rows: Rd004ObservationRow[],
  videoStartUtc: string,
): QualifiedSpeedPoint[] {
  const hfSpeed = rows.filter(
    (r) => r.providerField === 'speed' && r.acquisitionSurface === 'HF_HISTORICAL',
  );
  const staleDupes = identifyStaleHoldDuplicateRows(hfSpeed);
  const deduped = dedupePhysicalSamples(hfSpeed);
  const videoStartMs = Date.parse(videoStartUtc);

  const points: QualifiedSpeedPoint[] = [];
  let prevTs: number | null = null;
  for (const row of deduped.sort(
    (a, b) => (parseMs(a.providerTimestamp) ?? 0) - (parseMs(b.providerTimestamp) ?? 0),
  )) {
    const flags: string[] = [];
    if (staleDupes.has(row.acquisitionOrdinal)) flags.push('STALE_HOLD_DUPLICATE');
    const ts = parseMs(row.providerTimestamp);
    const speed = extractNumericValue(row.rawValueJson);
    if (ts == null || speed == null) continue;
    if (prevTs != null && ts < prevTs) flags.push('OUT_OF_ORDER');
    if (staleDupes.has(row.acquisitionOrdinal)) continue;
    prevTs = ts;
    points.push({
      acquisitionOrdinal: row.acquisitionOrdinal,
      providerTimestamp: row.providerTimestamp!,
      speedKmh: speed,
      videoRelativeSecondsProvisional: (ts - videoStartMs) / 1000,
      flags,
    });
  }
  return points;
}

export function detectOutOfOrderPairs(points: QualifiedSpeedPoint[]): number {
  let count = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = parseMs(points[i - 1]!.providerTimestamp);
    const cur = parseMs(points[i]!.providerTimestamp);
    if (prev != null && cur != null && cur < prev) count++;
  }
  return count;
}

export function computeQualifiedAccelerationPairs(
  points: QualifiedSpeedPoint[],
  maxGapSeconds: number,
) {
  const pairs: Array<{
    fromTimestamp: string;
    toTimestamp: string;
    dtSeconds: number;
    accelMs2: number;
    deltaKmh: number;
    qualified: boolean;
    rejectionReason: string | null;
  }> = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const dt = (parseMs(cur.providerTimestamp)! - parseMs(prev.providerTimestamp)!) / 1000;
    let qualified = true;
    let rejectionReason: string | null = null;
    if (dt <= 0) {
      qualified = false;
      rejectionReason = 'NON_POSITIVE_DT';
    } else if (dt > maxGapSeconds) {
      qualified = false;
      rejectionReason = 'UNQUALIFIED_GAP';
    }
    const dv = (cur.speedKmh - prev.speedKmh) / 3.6;
    const accel = dv / dt;
    pairs.push({
      fromTimestamp: prev.providerTimestamp,
      toTimestamp: cur.providerTimestamp,
      dtSeconds: dt,
      accelMs2: accel,
      deltaKmh: cur.speedKmh - prev.speedKmh,
      qualified,
      rejectionReason,
    });
  }
  const qualifiedPairs = pairs.filter((p) => p.qualified);
  return {
    pairs,
    qualifiedPairFraction: pairs.length ? qualifiedPairs.length / pairs.length : 0,
    qualifiedPairs,
    distribution: {
      maxPositiveMs2: Math.max(...qualifiedPairs.map((p) => p.accelMs2), 0),
      maxNegativeMs2: Math.min(...qualifiedPairs.map((p) => p.accelMs2), 0),
      medianMs2: qualifiedPairs.length
        ? percentile(qualifiedPairs.map((p) => p.accelMs2), 50)
        : null,
    },
  };
}

function findSpeedEpisodes(points: QualifiedSpeedPoint[]) {
  const episodes: Array<{
    type: 'deceleration' | 'stop' | 'launch' | 'stable_cruise' | 'low_speed';
    startTimestamp: string;
    endTimestamp: string;
    startSpeedKmh: number;
    endSpeedKmh: number;
    durationSeconds: number;
    meanSpeedKmh: number;
    videoRelativeStart: number;
    videoRelativeEnd: number;
  }> = [];

  if (points.length < 2) return episodes;

  let i = 0;
  while (i < points.length) {
    const start = points[i]!;
    let j = i + 1;
    while (j < points.length) {
      const cur = points[j]!;
      const prev = points[j - 1]!;
      const dt = (parseMs(cur.providerTimestamp)! - parseMs(prev.providerTimestamp)!) / 1000;
      if (dt > 60) break;
      const decreasing = cur.speedKmh <= prev.speedKmh + 0.5;
      if (!decreasing) break;
      j++;
    }
    if (j - i >= 2) {
      const end = points[j - 1]!;
      const drop = start.speedKmh - end.speedKmh;
      const dur =
        (parseMs(end.providerTimestamp)! - parseMs(start.providerTimestamp)!) / 1000;
      if (drop >= 15 && dur >= 10) {
        episodes.push({
          type: 'deceleration',
          startTimestamp: start.providerTimestamp,
          endTimestamp: end.providerTimestamp,
          startSpeedKmh: start.speedKmh,
          endSpeedKmh: end.speedKmh,
          durationSeconds: dur,
          meanSpeedKmh: (start.speedKmh + end.speedKmh) / 2,
          videoRelativeStart: start.videoRelativeSecondsProvisional,
          videoRelativeEnd: end.videoRelativeSecondsProvisional,
        });
      }
    }
    i = Math.max(i + 1, j);
  }

  for (let k = 0; k < points.length; k++) {
    const p = points[k]!;
    if (p.speedKmh <= 5) {
      let m = k + 1;
      while (m < points.length && points[m]!.speedKmh <= 5) {
        const dt =
          (parseMs(points[m]!.providerTimestamp)! - parseMs(points[m - 1]!.providerTimestamp)!) /
          1000;
        if (dt > 45) break;
        m++;
      }
      const dur =
        (parseMs(points[m - 1]!.providerTimestamp)! - parseMs(p.providerTimestamp)!) / 1000;
      if (dur >= 15 && m - k >= 2) {
        episodes.push({
          type: 'stop',
          startTimestamp: p.providerTimestamp,
          endTimestamp: points[m - 1]!.providerTimestamp,
          startSpeedKmh: p.speedKmh,
          endSpeedKmh: points[m - 1]!.speedKmh,
          durationSeconds: dur,
          meanSpeedKmh: 0,
          videoRelativeStart: p.videoRelativeSecondsProvisional,
          videoRelativeEnd: points[m - 1]!.videoRelativeSecondsProvisional,
        });
        k = m;
        continue;
      }
    }
  }

  for (let k = 0; k < points.length - 1; k++) {
    const p = points[k]!;
    const n = points[k + 1]!;
    if (p.speedKmh <= 8 && n.speedKmh - p.speedKmh >= 20) {
      let m = k + 1;
      while (m + 1 < points.length && points[m + 1]!.speedKmh >= points[m]!.speedKmh - 1) m++;
      const end = points[m]!;
      episodes.push({
        type: 'launch',
        startTimestamp: p.providerTimestamp,
        endTimestamp: end.providerTimestamp,
        startSpeedKmh: p.speedKmh,
        endSpeedKmh: end.speedKmh,
        durationSeconds:
          (parseMs(end.providerTimestamp)! - parseMs(p.providerTimestamp)!) / 1000,
        meanSpeedKmh: (p.speedKmh + end.speedKmh) / 2,
        videoRelativeStart: p.videoRelativeSecondsProvisional,
        videoRelativeEnd: end.videoRelativeSecondsProvisional,
      });
      k = m;
    }
  }

  for (let k = 0; k < points.length - 2; k++) {
    const window = points.slice(k, k + 4);
    if (window.length < 3) continue;
    const speeds = window.map((p) => p.speedKmh);
    const min = Math.min(...speeds);
    const max = Math.max(...speeds);
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const dur =
      (parseMs(window.at(-1)!.providerTimestamp)! - parseMs(window[0]!.providerTimestamp)!) /
      1000;
    if (min >= 48 && max <= 60 && max - min <= 8 && dur >= 12) {
      episodes.push({
        type: 'stable_cruise',
        startTimestamp: window[0]!.providerTimestamp,
        endTimestamp: window.at(-1)!.providerTimestamp,
        startSpeedKmh: window[0]!.speedKmh,
        endSpeedKmh: window.at(-1)!.speedKmh,
        durationSeconds: dur,
        meanSpeedKmh: mean,
        videoRelativeStart: window[0]!.videoRelativeSecondsProvisional,
        videoRelativeEnd: window.at(-1)!.videoRelativeSecondsProvisional,
      });
      k += 2;
    }
  }

  const early = points.filter((p) => p.videoRelativeSecondsProvisional <= 30 && p.speedKmh <= 8);
  if (early.length) {
    const p = early.reduce((best, cur) =>
      Math.abs(cur.speedKmh - 2) < Math.abs(best.speedKmh - 2) ? cur : best,
    );
    episodes.push({
      type: 'low_speed',
      startTimestamp: p.providerTimestamp,
      endTimestamp: p.providerTimestamp,
      startSpeedKmh: p.speedKmh,
      endSpeedKmh: p.speedKmh,
      durationSeconds: 0,
      meanSpeedKmh: p.speedKmh,
      videoRelativeStart: p.videoRelativeSecondsProvisional,
      videoRelativeEnd: p.videoRelativeSecondsProvisional,
    });
  }

  return episodes;
}

export const VIDEO_LANDMARKS = [
  {
    id: 'A',
    label: 'early reverse / low-speed',
    videoRelativeSecondsApprox: 8,
    expectedSpeedKmh: 2,
    episodeType: 'low_speed' as const,
  },
  {
    id: 'B',
    label: 'calm deceleration ~41→0 / ~30s',
    episodeType: 'deceleration' as const,
    expectedStartSpeedKmh: 35,
    expectedEndSpeedKmh: 5,
  },
  {
    id: 'C',
    label: 'prolonged stop ~30s',
    episodeType: 'stop' as const,
    minDurationSeconds: 15,
  },
  {
    id: 'D',
    label: 'launch 0→~56 km/h',
    episodeType: 'launch' as const,
    expectedEndSpeedKmh: 50,
  },
  {
    id: 'E',
    label: 'stable ~52–56 km/h ~20s',
    episodeType: 'stable_cruise' as const,
  },
  {
    id: 'F',
    label: 'deceleration ~55→0',
    episodeType: 'deceleration' as const,
    expectedStartSpeedKmh: 45,
  },
  {
    id: 'G',
    label: 'launch 0→~47 km/h',
    episodeType: 'launch' as const,
    expectedEndSpeedKmh: 40,
  },
  {
    id: 'H',
    label: 'final low-speed fuel-station approach',
    episodeType: 'low_speed' as const,
    videoRelativeSecondsApprox: 340,
  },
] as const;

export function matchVideoLandmarks(
  landmarks: typeof VIDEO_LANDMARKS,
  episodes: ReturnType<typeof findSpeedEpisodes>,
  videoStartUtc: string,
) {
  const videoStartMs = Date.parse(videoStartUtc);
  const matches: Array<Record<string, unknown>> = [];

  for (const lm of landmarks) {
    const candidates = episodes.filter((e) => e.type === lm.episodeType);
    let best: (typeof episodes)[number] | null = null;
    let bestScore = -Infinity;

    for (const c of candidates) {
      let score = 0;
      if ('expectedStartSpeedKmh' in lm && lm.expectedStartSpeedKmh != null) {
        score -= Math.abs(c.startSpeedKmh - lm.expectedStartSpeedKmh);
      }
      if ('expectedEndSpeedKmh' in lm && lm.expectedEndSpeedKmh != null) {
        score -= Math.abs(c.endSpeedKmh - lm.expectedEndSpeedKmh);
      }
      if ('minDurationSeconds' in lm && lm.minDurationSeconds != null) {
        score += c.durationSeconds >= lm.minDurationSeconds ? 5 : -10;
      }
      if ('videoRelativeSecondsApprox' in lm && lm.videoRelativeSecondsApprox != null) {
        score -= Math.abs(c.videoRelativeStart - lm.videoRelativeSecondsApprox) / 10;
      }
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    if (!best) {
      matches.push({
        landmarkId: lm.id,
        label: lm.label,
        status: 'NOT_FOUND_IN_TELEMETRY',
        confidence: 'INSUFFICIENT_EVIDENCE',
      });
      continue;
    }

    const expectedVideoT =
      'videoRelativeSecondsApprox' in lm && lm.videoRelativeSecondsApprox != null
        ? lm.videoRelativeSecondsApprox
        : best.videoRelativeStart;
    const offsetSeconds = best.videoRelativeStart - expectedVideoT;

    matches.push({
      landmarkId: lm.id,
      label: lm.label,
      videoRelativeApprox: expectedVideoT,
      telemetryVideoRelativeProvisional: best.videoRelativeStart,
      candidateProviderTimestamp: best.startTimestamp,
      candidateAbsoluteUtc: new Date(parseMs(best.startTimestamp)!).toISOString(),
      speedShape: {
        startSpeedKmh: best.startSpeedKmh,
        endSpeedKmh: best.endSpeedKmh,
        durationSeconds: best.durationSeconds,
        episodeType: best.type,
      },
      candidateOffsetSeconds: offsetSeconds,
      speedShapeAgreement:
        Math.abs(offsetSeconds) <= 15 ? 'GOOD' : Math.abs(offsetSeconds) <= 45 ? 'PARTIAL' : 'WEAK',
      confidence:
        Math.abs(offsetSeconds) <= 15
          ? 'MEDIUM'
          : Math.abs(offsetSeconds) <= 45
            ? 'LOW'
            : 'INSUFFICIENT_EVIDENCE',
    });
  }

  return matches;
}

export function estimateClockAlignment(
  landmarkMatches: Array<Record<string, unknown>>,
) {
  const offsets = landmarkMatches
    .map((m) => m.candidateOffsetSeconds as number | undefined)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  if (!offsets.length) {
    return {
      VIDEO_PROVIDER_ALIGNMENT_CLASS: 'INSUFFICIENT_EVIDENCE',
      VIDEO_TO_PROVIDER_OFFSET_SECONDS: null,
      OFFSET_MAD_SECONDS: null,
      candidateOffsetsPerEvent: [],
      medianOffsetSeconds: null,
      meanOffsetSeconds: null,
      minOffsetSeconds: null,
      maxOffsetSeconds: null,
      spreadSeconds: null,
    };
  }

  const sorted = [...offsets].sort((a, b) => a - b);
  const median = percentile(sorted, 50);
  const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
  const offsetMad = mad(offsets);
  const spread = Math.max(...offsets) - Math.min(...offsets);

  let alignmentClass: string;
  if (offsets.length < 2) alignmentClass = 'INSUFFICIENT_EVIDENCE';
  else if (spread <= 8) alignmentClass = 'STABLE_OFFSET';
  else if (spread <= 25) alignmentClass = 'AMBIGUOUS_ALIGNMENT';
  else alignmentClass = 'POSSIBLE_DRIFT';

  return {
    VIDEO_PROVIDER_ALIGNMENT_CLASS: alignmentClass,
    VIDEO_TO_PROVIDER_OFFSET_SECONDS: median,
    OFFSET_MAD_SECONDS: offsetMad,
    candidateOffsetsPerEvent: landmarkMatches
      .filter((m) => typeof m.candidateOffsetSeconds === 'number')
      .map((m) => ({ landmarkId: m.landmarkId, offsetSeconds: m.candidateOffsetSeconds })),
    medianOffsetSeconds: median,
    meanOffsetSeconds: mean,
    minOffsetSeconds: Math.min(...offsets),
    maxOffsetSeconds: Math.max(...offsets),
    spreadSeconds: spread,
  };
}

export function estimateDrift(
  landmarkMatches: Array<Record<string, unknown>>,
  videoDurationSeconds: number,
) {
  const points = landmarkMatches
    .filter(
      (m) =>
        typeof m.videoRelativeApprox === 'number' &&
        typeof m.candidateOffsetSeconds === 'number',
    )
    .map((m) => ({
      videoT: m.videoRelativeApprox as number,
      offset: m.candidateOffsetSeconds as number,
    }));

  if (points.length < 3 || videoDurationSeconds <= 0) {
    return {
      DRIFT_VALIDATED: 'NO',
      ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT: null,
      offsetAtBeginningSeconds: null,
      offsetAtEndSeconds: null,
      note: 'Insufficient separated landmarks for drift fit',
    };
  }

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.videoT, 0);
  const sumY = points.reduce((s, p) => s + p.offset, 0);
  const sumXY = points.reduce((s, p) => s + p.videoT * p.offset, 0);
  const sumXX = points.reduce((s, p) => s + p.videoT * p.videoT, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  const driftOverSegment = slope * videoDurationSeconds;

  return {
    DRIFT_VALIDATED: Math.abs(driftOverSegment) > 2 ? 'PARTIAL' : 'NO',
    ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT: driftOverSegment,
    offsetAtBeginningSeconds: intercept,
    offsetAtEndSeconds: intercept + driftOverSegment,
    slopeSecondsPerVideoSecond: slope,
    landmarkCount: points.length,
    note: 'Simple linear conceptual model — not overfit; whole-drive drift NOT finalized (Segment B pending)',
  };
}

export function buildHfReadingsForLegacyDetectors(
  rows: Rd004ObservationRow[],
): Array<{
  timestamp: string;
  speedKmh: number;
  rpm: number | null;
  throttlePosition: number | null;
  engineLoad: number | null;
}> {
  const hf = rows.filter((r) => r.acquisitionSurface === 'HF_HISTORICAL');
  const byTs = new Map<string, Record<string, number | null>>();
  for (const row of dedupePhysicalSamples(hf)) {
    const ts = row.providerTimestamp;
    if (!ts) continue;
    if (!byTs.has(ts)) byTs.set(ts, {});
    const bucket = byTs.get(ts)!;
    const val = extractNumericValue(row.rawValueJson);
    if (row.providerField === 'speed') bucket.speedKmh = val;
    if (row.providerField === 'powertrainCombustionEngineSpeed') bucket.rpm = val;
    if (row.providerField === 'obdThrottlePosition') bucket.throttlePosition = val;
    if (row.providerField === 'obdEngineLoad') bucket.engineLoad = val;
  }
  return [...byTs.entries()]
    .map(([timestamp, v]) => ({
      timestamp,
      speedKmh: v.speedKmh ?? 0,
      rpm: v.rpm ?? null,
      throttlePosition: v.throttlePosition ?? null,
      engineLoad: v.engineLoad ?? null,
    }))
    .filter((r) => r.speedKmh > 0 || r.rpm != null)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

export function runLegacyDetectorAudit(hfReadings: ReturnType<typeof buildHfReadingsForLegacyDetectors>) {
  const cleanPoints: CleanHfPoint[] = preprocessHighFrequency(
    hfReadings.map((r) => ({
      timestamp: r.timestamp,
      speedKmh: r.speedKmh,
      engineCoolantTempC: null,
      rpm: r.rpm,
      throttlePosition: r.throttlePosition,
      engineLoad: r.engineLoad,
      tractionBatteryPowerKw: null,
    })),
  );

  const accel = detectAccelerationEvents(cleanPoints);
  const brake = detectBrakingEvents(cleanPoints);
  const abuse = detectAbuseEvents(cleanPoints, { idleRpm: 700, maxRpm: 7000 });

  const classify = (
    classification: string,
    peakMs2: number,
    deltaKmh: number,
  ): 'PLAUSIBLE' | 'QUESTIONABLE' | 'LIKELY_FALSE_POSITIVE' | 'UNRESOLVED' => {
    if (classification === 'EXTREME' || classification === 'HARD') {
      if (Math.abs(deltaKmh) < 8 && peakMs2 < 4) return 'LIKELY_FALSE_POSITIVE';
      return 'QUESTIONABLE';
    }
    if (classification === 'LIGHT' || classification === 'MODERATE') return 'PLAUSIBLE';
    return 'UNRESOLVED';
  };

  const events = [
    ...accel.map((e) => ({
      detector: 'hf-acceleration',
      eventType: `ACCEL_${e.classification}`,
      providerTimestamp: e.startedAt.toISOString(),
      speedBeforeKmh: e.startSpeedKmh,
      speedAfterKmh: e.endSpeedKmh,
      peakMs2: e.peakAccelMs2,
      deltaKmh: e.deltaKmh,
      durationMs: e.durationMs,
      classification: classify(e.classification, e.peakAccelMs2, e.deltaKmh),
    })),
    ...brake.map((e) => ({
      detector: 'hf-braking',
      eventType: `BRAKE_${e.classification}`,
      providerTimestamp: e.startedAt.toISOString(),
      speedBeforeKmh: e.startSpeedKmh,
      speedAfterKmh: e.endSpeedKmh,
      peakMs2: e.peakDecelMs2,
      deltaKmh: e.deltaKmh,
      durationMs: e.durationMs,
      classification: classify(e.classification, e.peakDecelMs2, e.deltaKmh),
      note: 'KINEMATIC_DECELERATION_NOT_FRICTION_BRAKE',
    })),
    ...abuse.map((e) => ({
      detector: 'hf-abuse',
      eventType: e.eventType,
      providerTimestamp: e.startedAt.toISOString(),
      speedBeforeKmh: e.startSpeedKmh,
      speedAfterKmh: e.endSpeedKmh,
      peakMs2: e.peakValue,
      classification:
        e.eventType === 'FULL_BRAKING' || e.eventType === 'POSSIBLE_IMPACT'
          ? 'QUESTIONABLE'
          : e.eventType === 'LAUNCH_LIKE_START'
            ? 'PLAUSIBLE'
            : 'UNRESOLVED',
    })),
  ];

  const counts = {
    LEGACY_HARD_ACCEL_EVENTS: accel.filter((e) => e.classification === 'HARD').length,
    LEGACY_EXTREME_ACCEL_EVENTS: accel.filter((e) => e.classification === 'EXTREME').length,
    LEGACY_HARD_BRAKING_EVENTS: brake.filter((e) => e.classification === 'HARD').length,
    LEGACY_EXTREME_BRAKING_EVENTS: brake.filter((e) => e.classification === 'EXTREME').length,
    LEGACY_LAUNCH_LIKE_EVENTS: abuse.filter((e) => e.eventType === 'LAUNCH_LIKE_START').length,
    LEGACY_FULL_BRAKING_EVENTS: abuse.filter((e) => e.eventType === 'FULL_BRAKING').length,
    LIKELY_FALSE_POSITIVE_EVENTS: events.filter((e) => e.classification === 'LIKELY_FALSE_POSITIVE')
      .length,
  };

  return { events, counts, cleanPointCount: cleanPoints.length };
}

export function comparePreprocessingResponse(
  qualifiedSpeed: QualifiedSpeedPoint[],
  legacySidecar: LegacyPreprocessedSpeedRow[],
) {
  const legacyByTs = new Map(legacySidecar.map((r) => [r.providerTimestamp, r]));
  const pairs: Array<{
    providerTimestamp: string;
    rawKmh: number;
    legacyKmh: number;
    attenuationKmh: number;
  }> = [];

  for (const p of qualifiedSpeed) {
    const leg = legacyByTs.get(p.providerTimestamp);
    if (!leg) continue;
    pairs.push({
      providerTimestamp: p.providerTimestamp,
      rawKmh: p.speedKmh,
      legacyKmh: leg.legacy3PointSmoothedSpeedKmh,
      attenuationKmh: p.speedKmh - leg.legacy3PointSmoothedSpeedKmh,
    });
  }

  const peakAttenuations = pairs.map((p) => Math.abs(p.attenuationKmh));
  const maxAttenuation = peakAttenuations.length ? Math.max(...peakAttenuations) : null;

  const rawPeaks = qualifiedSpeed.filter((p, i, arr) => {
    if (i === 0 || i === arr.length - 1) return false;
    return p.speedKmh > arr[i - 1]!.speedKmh && p.speedKmh > arr[i + 1]!.speedKmh;
  });
  const startShifts: number[] = [];
  for (const peak of rawPeaks) {
    const legacyPeak = pairs
      .filter((p) => Math.abs(p.rawKmh - peak.speedKmh) < 2)
      .sort((a, b) => Math.abs(b.attenuationKmh) - Math.abs(a.attenuationKmh))[0];
    if (legacyPeak) {
      const legacyMatch = pairs.find(
        (p) =>
          Math.abs(p.legacyKmh - legacyPeak.legacyKmh) < 1 &&
          p.providerTimestamp !== legacyPeak.providerTimestamp,
      );
      if (legacyMatch) {
        startShifts.push(
          (parseMs(legacyMatch.providerTimestamp)! - parseMs(legacyPeak.providerTimestamp)!) / 1000,
        );
      }
    }
  }

  return {
    comparedPairs: pairs.length,
    PREPROCESSING_PEAK_ATTENUATION_KMH: maxAttenuation,
    PREPROCESSING_START_SHIFT_SECONDS_MEDIAN: startShifts.length
      ? percentile(startShifts.map(Math.abs), 50)
      : null,
    PREPROCESSING_END_SHIFT_SECONDS_MEDIAN: null,
    PREPROCESSING_FALSE_EVENT_CREATION: 'NOT_MEASURED_SPARSE_CADENCE',
    PREPROCESSING_FALSE_EVENT_SUPPRESSION: 'NOT_MEASURED_SPARSE_CADENCE',
    note: 'Sparse HF cadence limits event-level timing distortion metrics; pair-level attenuation reported',
    samplePairs: pairs.slice(0, 10),
  };
}

export function analyzeReverseSupport(rows: Rd004ObservationRow[]) {
  const gear = rows.filter(
    (r) =>
      r.providerField === 'powertrainTransmissionActualGear' &&
      r.acquisitionSurface === 'HF_HISTORICAL',
  );
  const ratio = rows.filter(
    (r) =>
      r.providerField === 'powertrainTransmissionActualGearRatio' &&
      r.acquisitionSurface === 'HF_HISTORICAL',
  );
  const earlyGear = gear.filter((r) => {
    const t = parseMs(r.providerTimestamp);
    return t != null && t <= Date.parse(SEGMENT_A_CONSTANTS.videoStartUtc) + 30_000;
  });
  const values = earlyGear.map((r) => extractNumericValue(r.rawValueJson)).filter((v) => v != null);
  const hasReverseIndicator = values.some((v) => v < 0 || v === 0);
  const hasLowGear = values.some((v) => v > 0 && v <= 2);

  let support: 'YES' | 'PARTIAL' | 'NO';
  if (hasReverseIndicator) support = 'YES';
  else if (hasLowGear || ratio.length > 0) support = 'PARTIAL';
  else support = 'NO';

  return {
    REVERSE_VIDEO_OBSERVED: 'YES',
    REVERSE_TELEMETRY_SUPPORTED: support,
    earlyGearObservations: earlyGear.length,
    earlyGearValues: values,
    note: 'Unsigned speed cannot establish reverse; gear/ratio only',
  };
}

export function analyzeSupportingSignals(rows: Rd004ObservationRow[]) {
  const fields = [
    'powertrainCombustionEngineSpeed',
    'obdThrottlePosition',
    'powertrainCombustionEngineTPS',
    'obdEngineLoad',
    'powertrainTransmissionActualGear',
  ] as const;
  const out: Record<string, string> = {};
  for (const field of fields) {
    const hf = rows.filter((r) => r.providerField === field && r.acquisitionSurface === 'HF_HISTORICAL');
    const cadence = hf.length ? computePhysicalCadenceMetrics(hf) : null;
    if (!hf.length) out[field] = 'NOT_OBSERVED';
    else if ((cadence?.UNIQUE_PHYSICAL_SAMPLE_COUNT ?? 0) >= 5) out[field] = 'USEFUL_WITH_GATING';
    else out[field] = 'WEAK';
  }
  return {
    RPM_CONTEXT_USEFUL: out.powertrainCombustionEngineSpeed === 'USEFUL_WITH_GATING' ? 'YES' : 'PARTIAL',
    THROTTLE_CONTEXT_USEFUL: out.obdThrottlePosition === 'USEFUL_WITH_GATING' ? 'YES' : 'PARTIAL',
    TPS_CONTEXT_USEFUL: out.powertrainCombustionEngineTPS === 'USEFUL_WITH_GATING' ? 'YES' : 'PARTIAL',
    GEAR_STATE_USEFUL: out.powertrainTransmissionActualGear === 'USEFUL_WITH_GATING' ? 'YES' : 'PARTIAL',
    perField: out,
    thermalWarmupNote:
      'Engine/powertrain warming ~24/24°C → ~47/39°C during Segment A — do not compare early/late RPM/load as constant-thermal',
  };
}

export type Rd004SegmentAAnalysisInput = {
  observations: Rd004ObservationRow[];
  legacySidecar: LegacyPreprocessedSpeedRow[];
};

export function runRd004SegmentAAnalysis(input: Rd004SegmentAAnalysisInput) {
  const envelope = filterRowsByProviderTimestampEnvelope(
    input.observations,
    SEGMENT_A_CONSTANTS.queryEnvelopeStartUtc,
    SEGMENT_A_CONSTANTS.queryEnvelopeEndUtc,
  );

  const signalCadence: Record<string, Record<string, ReturnType<typeof analyzeSignalCadenceForField>>> = {};
  for (const field of SEGMENT_A_SIGNALS) {
    signalCadence[field] = {};
    for (const surface of ACQUISITION_SURFACES) {
      signalCadence[field][surface] = analyzeSignalCadenceForField(envelope, field, surface);
    }
  }

  const qualifiedSpeed = buildQualifiedHfSpeedSeries(envelope, SEGMENT_A_CONSTANTS.videoStartUtc);
  const hfSpeedCadence = computePhysicalCadenceMetrics(
    envelope.filter((r) => r.providerField === 'speed' && r.acquisitionSurface === 'HF_HISTORICAL'),
  );
  const staleDupes = identifyStaleHoldDuplicateRows(
    envelope.filter((r) => r.providerField === 'speed' && r.acquisitionSurface === 'HF_HISTORICAL'),
  );

  const acceleration = computeQualifiedAccelerationPairs(
    qualifiedSpeed,
    PROVISIONAL_ACCELERATION_MAX_GAP_SECONDS,
  );
  const episodes = findSpeedEpisodes(qualifiedSpeed);
  const landmarkMatches = matchVideoLandmarks(
    VIDEO_LANDMARKS,
    episodes,
    SEGMENT_A_CONSTANTS.videoStartUtc,
  );
  const clock = estimateClockAlignment(landmarkMatches);
  const drift = estimateDrift(landmarkMatches, SEGMENT_A_CONSTANTS.videoDurationSeconds);

  const hfReadings = buildHfReadingsForLegacyDetectors(envelope);
  const legacyAudit = runLegacyDetectorAudit(hfReadings);
  const preprocessing = comparePreprocessingResponse(
    qualifiedSpeed,
    input.legacySidecar.filter((r) => {
      const t = parseMs(r.providerTimestamp);
      return (
        t != null &&
        t >= Date.parse(SEGMENT_A_CONSTANTS.queryEnvelopeStartUtc) &&
        t <= Date.parse(SEGMENT_A_CONSTANTS.queryEnvelopeEndUtc)
      );
    }),
  );
  const reverse = analyzeReverseSupport(envelope);
  const supporting = analyzeSupportingSignals(envelope);

  const approximateLandmarks = [
    {
      id: 'A',
      videoRelativeSeconds: 8,
      videoSpeedKmhApprox: 2,
      note: 'APPROXIMATE_VIDEO_LANDMARK — human reviewed, not frame-exact',
    },
  ];

  const flags = {
    RD004_PHASE: RD004_A_PHASE,
    RD004_SEGMENT_A_VIDEO_START_UTC: SEGMENT_A_CONSTANTS.videoStartUtc,
    RD004_SEGMENT_A_VIDEO_END_UTC: SEGMENT_A_CONSTANTS.videoEndUtc,
    HF_HISTORICAL_AVAILABLE: qualifiedSpeed.length > 0 ? 'YES' : 'NO',
    HF_SPEED_ROWS: envelope.filter(
      (r) => r.providerField === 'speed' && r.acquisitionSurface === 'HF_HISTORICAL',
    ).length,
    HF_SPEED_UNIQUE_PHYSICAL_SAMPLES: hfSpeedCadence.UNIQUE_PHYSICAL_SAMPLE_COUNT,
    HF_SPEED_MEDIAN_PHYSICAL_CADENCE_SECONDS: hfSpeedCadence.NEW_PHYSICAL_SAMPLE_CADENCE_MEDIAN_SECONDS,
    HF_SPEED_P90_PHYSICAL_CADENCE_SECONDS: hfSpeedCadence.NEW_PHYSICAL_SAMPLE_CADENCE_P90_SECONDS,
    HF_SPEED_MAX_GAP_SECONDS: hfSpeedCadence.NEW_PHYSICAL_SAMPLE_CADENCE_MAX_GAP_SECONDS,
    DUPLICATE_SPEED_SAMPLES: staleDupes.size,
    STALE_HOLD_SPEED_SAMPLES: detectStaleHolds(
      envelope.filter((r) => r.providerField === 'speed' && r.acquisitionSurface === 'HF_HISTORICAL'),
    ).length,
    OUT_OF_ORDER_SPEED_SAMPLES: detectOutOfOrderPairs(qualifiedSpeed),
    VIDEO_PROVIDER_ALIGNMENT_CLASS: clock.VIDEO_PROVIDER_ALIGNMENT_CLASS,
    VIDEO_TO_PROVIDER_OFFSET_SECONDS: clock.VIDEO_TO_PROVIDER_OFFSET_SECONDS,
    OFFSET_MAD_SECONDS: clock.OFFSET_MAD_SECONDS,
    DRIFT_VALIDATED: drift.DRIFT_VALIDATED,
    ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT: drift.ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT,
    EXACT_VIDEO_SPEED_ANCHORS: 0,
    SPEED_MAE_KMH: null,
    SPEED_MEDIAN_ABS_ERROR_KMH: null,
    SPEED_BIAS_KMH: null,
    ABSOLUTE_SPEED_ACCURACY_VALIDATED: 'NO',
    QUALIFIED_ACCELERATION_PAIR_FRACTION: acceleration.qualifiedPairFraction,
    ...legacyAudit.counts,
    PREPROCESSING_PEAK_ATTENUATION: preprocessing.PREPROCESSING_PEAK_ATTENUATION_KMH,
    PREPROCESSING_START_SHIFT: preprocessing.PREPROCESSING_START_SHIFT_SECONDS_MEDIAN,
    PREPROCESSING_END_SHIFT: preprocessing.PREPROCESSING_END_SHIFT_SECONDS_MEDIAN,
    PREPROCESSING_FALSE_EVENT_CREATION: preprocessing.PREPROCESSING_FALSE_EVENT_CREATION,
    PREPROCESSING_FALSE_EVENT_SUPPRESSION: preprocessing.PREPROCESSING_FALSE_EVENT_SUPPRESSION,
    RPM_CONTEXT_USEFUL: supporting.RPM_CONTEXT_USEFUL,
    THROTTLE_CONTEXT_USEFUL: supporting.THROTTLE_CONTEXT_USEFUL,
    TPS_CONTEXT_USEFUL: supporting.TPS_CONTEXT_USEFUL,
    GEAR_STATE_USEFUL: supporting.GEAR_STATE_USEFUL,
    REVERSE_VIDEO_OBSERVED: reverse.REVERSE_VIDEO_OBSERVED,
    REVERSE_TELEMETRY_SUPPORTED: reverse.REVERSE_TELEMETRY_SUPPORTED,
    CALM_BASELINE_VALIDATED: legacyAudit.counts.LIKELY_FALSE_POSITIVE_EVENTS === 0 ? 'PARTIAL' : 'NO',
    RD004_SEGMENT_A_COMPLETE: 'YES',
    RD004_WHOLE_DRIVE_COMPLETE: 'NO',
    SEGMENT_B_PENDING: 'YES',
    PRODUCTION_SCORE_CHANGED: 'NO',
    PRODUCTION_DETECTORS_CHANGED: 'NO',
    TIRE_RUNTIME_CHANGED: 'NO',
    BRAKE_RUNTIME_CHANGED: 'NO',
    DEPLOYED: 'NO',
    READY_FOR_RD004_SEGMENT_B: 'YES',
  };

  return {
    evidenceId: RD004_A_EVIDENCE_ID,
    mode: RD004_A_MODE,
    constants: SEGMENT_A_CONSTANTS,
    envelopeRowCount: envelope.length,
    signalCadence,
    qualifiedSpeedSeries: qualifiedSpeed,
    videoClockAlignment: {
      projection: 'PROVISIONAL_ZERO_OFFSET_PROJECTION',
      nominalVideoStartUtc: SEGMENT_A_CONSTANTS.videoStartUtc,
      landmarkMatches,
      clock,
      drift,
    },
    speedComparison: {
      exactOrHighConfidenceAnchors: [],
      approximateVideoLandmarks: approximateLandmarks,
      ABSOLUTE_SPEED_ACCURACY_VALIDATED: 'NO',
      note: 'No frame-exact digital speed OCR in this phase — approximate human landmarks only',
    },
    kinematicReconstruction: acceleration,
    telemetryEpisodesDetected: episodes,
    legacyDetectorAudit: legacyAudit,
    preprocessingResponse: preprocessing,
    supportingSignals: supporting,
    reverseValidation: reverse,
    flags,
  };
}

export function rd004SegmentAOutputSha256(artifacts: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(stableStringify(artifacts)).digest('hex');
}
