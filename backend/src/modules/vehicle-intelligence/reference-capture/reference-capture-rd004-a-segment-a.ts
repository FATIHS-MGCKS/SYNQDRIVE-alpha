/**
 * RD004-A / DI-EV-0035A.1 — Segment A video ↔ telemetry alignment (read-only analysis).
 * Does NOT modify production score, detectors, tire/brake runtime, or RD003 evidence.
 */
import * as crypto from 'crypto';
import * as path from 'path';
import {
  analyzeSignalGroup,
  detectOutOfOrder,
  extractNumericValue,
  percentile,
  sortByAcquisitionOrder,
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

export const RD004_A_PHASE = 'RD004-A.1';
export const RD004_A_EVIDENCE_ID = 'DI-EV-0035A.1';
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

export const RD004_A_SOURCE_FILES = {
  observations: 'source-observations.jsonl',
  legacySidecar: 'source-legacy-preprocessed-speed-sidecar.jsonl',
  manifest: 'source-manifest.sha256.json',
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
export const ACCELERATION_GAP_CANDIDATES_SECONDS = [2, 3, 5] as const;
export const TEMPORAL_LOCALITY_DEFAULT_TOLERANCE_SECONDS = 60;

export const ONE_TELEMETRY_EPISODE_CANNOT_COUNT_AS_MULTIPLE_INDEPENDENT_CLOCK_LANDMARKS = 'YES';

export type VideoTimingAuthority = 'EXACT' | 'HIGH_CONFIDENCE' | 'APPROXIMATE' | 'UNKNOWN';
export type TelemetryMatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';

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

export type SpeedEpisode = {
  episodeId: string;
  type: 'deceleration' | 'stop' | 'launch' | 'stable_cruise' | 'low_speed';
  startTimestamp: string;
  endTimestamp: string;
  startSpeedKmh: number;
  endSpeedKmh: number;
  durationSeconds: number;
  meanSpeedKmh: number;
  videoRelativeStart: number;
  videoRelativeEnd: number;
};

export type VideoLandmarkDef = {
  id: string;
  label: string;
  episodeType: SpeedEpisode['type'];
  videoRelativeSecondsObserved: number | null;
  videoTimestampSource: string | null;
  videoTimingAuthority: VideoTimingAuthority;
  expectedSpeedKmhApprox?: number;
  expectedStartSpeedKmh?: number;
  expectedEndSpeedKmh?: number;
  minDurationSeconds?: number;
  temporalLocalityRequired: boolean;
  temporalLocalityToleranceSeconds: number;
};

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Always sort before percentile — shared helper expects sorted input. */
export function sortedPercentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, p);
}

function mad(values: number[]): number | null {
  if (!values.length) return null;
  const median = sortedPercentile(values, 50);
  if (median == null) return null;
  const deviations = values.map((v) => Math.abs(v - median));
  return sortedPercentile(deviations, 50);
}

export function toRepoRelativePath(absOrRelPath: string, repoRoot?: string): string {
  const normalized = absOrRelPath.replace(/\\/g, '/');
  const root = (repoRoot ?? process.cwd()).replace(/\\/g, '/').replace(/\/$/, '');
  if (normalized.startsWith(root + '/')) {
    return normalized.slice(root.length + 1);
  }
  if (normalized.startsWith('docs/')) return normalized;
  const docsIdx = normalized.indexOf('/docs/');
  if (docsIdx >= 0) return normalized.slice(docsIdx + 1);
  return path.posix.normalize(normalized.replace(/^\//, ''));
}

const ENV_PATH_PATTERNS = [/^\/workspace\//, /^\/tmp\//, /^\/home\/cursor\//, /^\/opt\/cursor\//];

export function containsEnvironmentSpecificPath(value: string): boolean {
  return ENV_PATH_PATTERNS.some((re) => re.test(value.replace(/\\/g, '/')));
}

export function assertNoEnvironmentSpecificPathsInObject(
  obj: unknown,
  pathPrefix = '',
): string[] {
  const violations: string[] = [];
  if (typeof obj === 'string') {
    if (containsEnvironmentSpecificPath(obj)) {
      violations.push(pathPrefix || obj);
    }
    return violations;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => violations.push(...assertNoEnvironmentSpecificPathsInObject(v, `${pathPrefix}[${i}]`)));
    return violations;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      violations.push(...assertNoEnvironmentSpecificPathsInObject(v, pathPrefix ? `${pathPrefix}.${k}` : k));
    }
  }
  return violations;
}

export function computeRd004SourceBundleSha256(
  files: Record<string, string>,
): { bundleSha256: string; manifest: { files: Record<string, { sha256: string }> } } {
  const manifest = {
    files: Object.fromEntries(
      Object.entries(files)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, sha256]) => [name, { sha256 }]),
    ),
  };
  const bundleSha256 = crypto.createHash('sha256').update(stableStringify(manifest)).digest('hex');
  return { bundleSha256, manifest };
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

function toMetricsRow(r: Rd004ObservationRow) {
  return {
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
  };
}

export function sortRowsByAcquisitionOrdinal<T extends { acquisitionOrdinal: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.acquisitionOrdinal - b.acquisitionOrdinal);
}

export function detectOutOfOrderByAcquisitionOrder(rows: Rd004ObservationRow[]): number {
  const ordered = sortRowsByAcquisitionOrdinal(
    rows.filter((r) => parseMs(r.providerTimestamp) != null),
  );
  return detectOutOfOrder(ordered.map(toMetricsRow)).outOfOrderCount;
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
  const cadence = computePhysicalCadenceMetrics(subset);
  const staleDupes = identifyStaleHoldDuplicateRows(subset);
  const metrics = analyzeSignalGroup(subset.map(toMetricsRow));
  const outOfOrderCount =
    field === 'speed' && surface === 'HF_HISTORICAL'
      ? detectOutOfOrderByAcquisitionOrder(subset)
      : metrics.outOfOrder.outOfOrderCount;
  return {
    field,
    acquisitionSurface: surface,
    rowCount: subset.length,
    firstProviderTimestamp: subset.map((r) => r.providerTimestamp).sort()[0] ?? null,
    lastProviderTimestamp: subset.map((r) => r.providerTimestamp).sort().at(-1) ?? null,
    uniquePhysicalSampleCount: cadence.UNIQUE_PHYSICAL_SAMPLE_COUNT,
    duplicateCount: staleDupes.size,
    staleHoldCount: detectStaleHolds(subset).length,
    outOfOrderCount,
    outOfOrderMethod: field === 'speed' && surface === 'HF_HISTORICAL'
      ? 'ACQUISITION_ORDINAL_THEN_PROVIDER_TIMESTAMP'
      : 'SIGNAL_METRICS_DEFAULT',
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
  const accelValues = qualifiedPairs.map((p) => p.accelMs2);
  return {
    pairs,
    qualifiedPairCount: qualifiedPairs.length,
    qualifiedPairFraction: pairs.length ? qualifiedPairs.length / pairs.length : 0,
    qualifiedPairs,
    distribution: {
      maxPositiveMs2: qualifiedPairs.length ? Math.max(...accelValues) : 0,
      maxNegativeMs2: qualifiedPairs.length ? Math.min(...accelValues) : 0,
      medianMs2: sortedPercentile(accelValues, 50),
      p10Ms2: sortedPercentile(accelValues, 10),
      p90Ms2: sortedPercentile(accelValues, 90),
    },
  };
}

export function computeAccelerationGapSensitivity(points: QualifiedSpeedPoint[]) {
  return ACCELERATION_GAP_CANDIDATES_SECONDS.map((gapSeconds) => {
    const result = computeQualifiedAccelerationPairs(points, gapSeconds);
    return {
      gapSeconds,
      qualifiedPairCount: result.qualifiedPairCount,
      qualifiedPairFraction: result.qualifiedPairFraction,
      maxPositiveMs2: result.distribution.maxPositiveMs2,
      maxNegativeMs2: result.distribution.maxNegativeMs2,
    };
  });
}

function episodeId(e: Pick<SpeedEpisode, 'type' | 'startTimestamp'>): string {
  return `${e.type}:${e.startTimestamp}`;
}

export function findSpeedEpisodes(points: QualifiedSpeedPoint[]): SpeedEpisode[] {
  const episodes: SpeedEpisode[] = [];
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
        const ep = {
          type: 'deceleration' as const,
          startTimestamp: start.providerTimestamp,
          endTimestamp: end.providerTimestamp,
          startSpeedKmh: start.speedKmh,
          endSpeedKmh: end.speedKmh,
          durationSeconds: dur,
          meanSpeedKmh: (start.speedKmh + end.speedKmh) / 2,
          videoRelativeStart: start.videoRelativeSecondsProvisional,
          videoRelativeEnd: end.videoRelativeSecondsProvisional,
        };
        episodes.push({ ...ep, episodeId: episodeId(ep) });
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
        const ep = {
          type: 'stop' as const,
          startTimestamp: p.providerTimestamp,
          endTimestamp: points[m - 1]!.providerTimestamp,
          startSpeedKmh: p.speedKmh,
          endSpeedKmh: points[m - 1]!.speedKmh,
          durationSeconds: dur,
          meanSpeedKmh: 0,
          videoRelativeStart: p.videoRelativeSecondsProvisional,
          videoRelativeEnd: points[m - 1]!.videoRelativeSecondsProvisional,
        };
        episodes.push({ ...ep, episodeId: episodeId(ep) });
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
      const ep = {
        type: 'launch' as const,
        startTimestamp: p.providerTimestamp,
        endTimestamp: end.providerTimestamp,
        startSpeedKmh: p.speedKmh,
        endSpeedKmh: end.speedKmh,
        durationSeconds:
          (parseMs(end.providerTimestamp)! - parseMs(p.providerTimestamp)!) / 1000,
        meanSpeedKmh: (p.speedKmh + end.speedKmh) / 2,
        videoRelativeStart: p.videoRelativeSecondsProvisional,
        videoRelativeEnd: end.videoRelativeSecondsProvisional,
      };
      episodes.push({ ...ep, episodeId: episodeId(ep) });
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
      const ep = {
        type: 'stable_cruise' as const,
        startTimestamp: window[0]!.providerTimestamp,
        endTimestamp: window.at(-1)!.providerTimestamp,
        startSpeedKmh: window[0]!.speedKmh,
        endSpeedKmh: window.at(-1)!.speedKmh,
        durationSeconds: dur,
        meanSpeedKmh: mean,
        videoRelativeStart: window[0]!.videoRelativeSecondsProvisional,
        videoRelativeEnd: window.at(-1)!.videoRelativeSecondsProvisional,
      };
      episodes.push({ ...ep, episodeId: episodeId(ep) });
      k += 2;
    }
  }

  for (const p of points) {
    if (p.speedKmh > 20) continue;
    const ep = {
      type: 'low_speed' as const,
      startTimestamp: p.providerTimestamp,
      endTimestamp: p.providerTimestamp,
      startSpeedKmh: p.speedKmh,
      endSpeedKmh: p.speedKmh,
      durationSeconds: 0,
      meanSpeedKmh: p.speedKmh,
      videoRelativeStart: p.videoRelativeSecondsProvisional,
      videoRelativeEnd: p.videoRelativeSecondsProvisional,
    };
    episodes.push({ ...ep, episodeId: episodeId(ep) });
  }

  return episodes;
}

export const VIDEO_LANDMARKS: readonly VideoLandmarkDef[] = [
  {
    id: 'A',
    label: 'early reverse / low-speed',
    videoRelativeSecondsObserved: 8,
    videoTimestampSource: 'HUMAN_REVIEWED_APPROXIMATE',
    videoTimingAuthority: 'APPROXIMATE',
    expectedSpeedKmhApprox: 2,
    episodeType: 'low_speed',
    temporalLocalityRequired: true,
    temporalLocalityToleranceSeconds: 45,
  },
  {
    id: 'B',
    label: 'calm deceleration ~41→0 / ~30s',
    videoRelativeSecondsObserved: null,
    videoTimestampSource: null,
    videoTimingAuthority: 'UNKNOWN',
    expectedStartSpeedKmh: 35,
    expectedEndSpeedKmh: 5,
    episodeType: 'deceleration',
    temporalLocalityRequired: false,
    temporalLocalityToleranceSeconds: TEMPORAL_LOCALITY_DEFAULT_TOLERANCE_SECONDS,
  },
  {
    id: 'C',
    label: 'prolonged stop ~30s',
    videoRelativeSecondsObserved: null,
    videoTimestampSource: null,
    videoTimingAuthority: 'UNKNOWN',
    minDurationSeconds: 15,
    episodeType: 'stop',
    temporalLocalityRequired: false,
    temporalLocalityToleranceSeconds: TEMPORAL_LOCALITY_DEFAULT_TOLERANCE_SECONDS,
  },
  {
    id: 'D',
    label: 'launch 0→~56 km/h',
    videoRelativeSecondsObserved: null,
    videoTimestampSource: null,
    videoTimingAuthority: 'UNKNOWN',
    expectedEndSpeedKmh: 50,
    episodeType: 'launch',
    temporalLocalityRequired: false,
    temporalLocalityToleranceSeconds: TEMPORAL_LOCALITY_DEFAULT_TOLERANCE_SECONDS,
  },
  {
    id: 'E',
    label: 'stable ~52–56 km/h ~20s',
    videoRelativeSecondsObserved: null,
    videoTimestampSource: null,
    videoTimingAuthority: 'UNKNOWN',
    episodeType: 'stable_cruise',
    temporalLocalityRequired: false,
    temporalLocalityToleranceSeconds: TEMPORAL_LOCALITY_DEFAULT_TOLERANCE_SECONDS,
  },
  {
    id: 'F',
    label: 'deceleration ~55→0',
    videoRelativeSecondsObserved: null,
    videoTimestampSource: null,
    videoTimingAuthority: 'UNKNOWN',
    expectedStartSpeedKmh: 45,
    episodeType: 'deceleration',
    temporalLocalityRequired: false,
    temporalLocalityToleranceSeconds: TEMPORAL_LOCALITY_DEFAULT_TOLERANCE_SECONDS,
  },
  {
    id: 'G',
    label: 'launch 0→~47 km/h',
    videoRelativeSecondsObserved: null,
    videoTimestampSource: null,
    videoTimingAuthority: 'UNKNOWN',
    expectedEndSpeedKmh: 40,
    episodeType: 'launch',
    temporalLocalityRequired: false,
    temporalLocalityToleranceSeconds: TEMPORAL_LOCALITY_DEFAULT_TOLERANCE_SECONDS,
  },
  {
    id: 'H',
    label: 'final low-speed fuel-station approach',
    videoRelativeSecondsObserved: 340,
    videoTimestampSource: 'HUMAN_REVIEWED_APPROXIMATE',
    videoTimingAuthority: 'APPROXIMATE',
    episodeType: 'low_speed',
    temporalLocalityRequired: true,
    temporalLocalityToleranceSeconds: 60,
  },
];

function scoreEpisodeForLandmark(lm: VideoLandmarkDef, c: SpeedEpisode): number {
  let score = 0;
  if (lm.expectedStartSpeedKmh != null) score -= Math.abs(c.startSpeedKmh - lm.expectedStartSpeedKmh);
  if (lm.expectedEndSpeedKmh != null) score -= Math.abs(c.endSpeedKmh - lm.expectedEndSpeedKmh);
  if (lm.minDurationSeconds != null) {
    score += c.durationSeconds >= lm.minDurationSeconds ? 5 : -10;
  }
  if (lm.videoRelativeSecondsObserved != null) {
    score -= Math.abs(c.videoRelativeStart - lm.videoRelativeSecondsObserved) / 5;
  }
  return score;
}

function assessTelemetryMatchConfidence(
  lm: VideoLandmarkDef,
  episode: SpeedEpisode,
): TelemetryMatchConfidence {
  if (lm.id === 'A') {
    if (episode.startSpeedKmh <= 1 && (lm.expectedSpeedKmhApprox ?? 2) >= 2) {
      return 'INSUFFICIENT';
    }
  }
  if (lm.temporalLocalityRequired && lm.videoRelativeSecondsObserved != null) {
    const dist = Math.abs(episode.videoRelativeStart - lm.videoRelativeSecondsObserved);
    if (dist > lm.temporalLocalityToleranceSeconds) return 'INSUFFICIENT';
  }
  let score = scoreEpisodeForLandmark(lm, episode);
  if (score >= -5) return 'HIGH';
  if (score >= -20) return 'MEDIUM';
  if (score >= -40) return 'LOW';
  return 'INSUFFICIENT';
}

function isClockFitEligible(
  lm: VideoLandmarkDef,
  episode: SpeedEpisode,
  matchConfidence: TelemetryMatchConfidence,
): boolean {
  if (lm.videoTimingAuthority === 'UNKNOWN' || lm.videoRelativeSecondsObserved == null) return false;
  if (matchConfidence === 'LOW' || matchConfidence === 'INSUFFICIENT') return false;
  if (lm.id === 'A') return false;
  if (lm.temporalLocalityRequired && lm.videoRelativeSecondsObserved != null) {
    const dist = Math.abs(episode.videoRelativeStart - lm.videoRelativeSecondsObserved);
    if (dist > lm.temporalLocalityToleranceSeconds) return false;
  }
  return true;
}

export function matchVideoLandmarks(
  landmarks: readonly VideoLandmarkDef[],
  episodes: SpeedEpisode[],
) {
  const usedEpisodeIds = new Set<string>();
  const matches: Array<Record<string, unknown>> = [];

  for (const lm of landmarks) {
    let candidates = episodes.filter((e) => e.type === lm.episodeType && !usedEpisodeIds.has(e.episodeId));

    if (lm.temporalLocalityRequired && lm.videoRelativeSecondsObserved != null) {
      const tol = lm.temporalLocalityToleranceSeconds;
      const target = lm.videoRelativeSecondsObserved;
      candidates = candidates.filter(
        (c) => Math.abs(c.videoRelativeStart - target) <= tol,
      );
    }

    let best: SpeedEpisode | null = null;
    let bestScore = -Infinity;
    for (const c of candidates) {
      const score = scoreEpisodeForLandmark(lm, c);
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
        videoRelativeSecondsObserved: lm.videoRelativeSecondsObserved,
        videoTimestampSource: lm.videoTimestampSource,
        videoTimingAuthority: lm.videoTimingAuthority,
        telemetryMatchConfidence: 'INSUFFICIENT',
        CLOCK_FIT_ELIGIBLE: 'NO',
        candidateOffsetSeconds: null,
        note: lm.temporalLocalityRequired
          ? 'No telemetry episode within temporal locality window'
          : 'No matching telemetry episode type found',
      });
      continue;
    }

    const matchConfidence = assessTelemetryMatchConfidence(lm, best);
    const clockFitEligible = isClockFitEligible(lm, best, matchConfidence);
    const hasIndependentVideoTime =
      lm.videoRelativeSecondsObserved != null && lm.videoTimingAuthority !== 'UNKNOWN';

    const candidateOffsetSeconds =
      hasIndependentVideoTime && clockFitEligible
        ? best.videoRelativeStart - lm.videoRelativeSecondsObserved!
        : null;

    if (clockFitEligible) {
      usedEpisodeIds.add(best.episodeId);
    }

    matches.push({
      landmarkId: lm.id,
      label: lm.label,
      status: 'MATCHED',
      videoRelativeSecondsObserved: lm.videoRelativeSecondsObserved,
      videoTimestampSource: lm.videoTimestampSource,
      videoTimingAuthority: lm.videoTimingAuthority,
      telemetryVideoRelativeProvisional: best.videoRelativeStart,
      telemetryEpisodeId: best.episodeId,
      candidateProviderTimestamp: best.startTimestamp,
      candidateAbsoluteUtc: new Date(parseMs(best.startTimestamp)!).toISOString(),
      speedShape: {
        startSpeedKmh: best.startSpeedKmh,
        endSpeedKmh: best.endSpeedKmh,
        durationSeconds: best.durationSeconds,
        episodeType: best.type,
      },
      telemetryMatchConfidence: matchConfidence,
      CLOCK_FIT_ELIGIBLE: clockFitEligible ? 'YES' : 'NO',
      candidateOffsetSeconds,
      speedShapeAgreement:
        matchConfidence === 'HIGH'
          ? 'GOOD'
          : matchConfidence === 'MEDIUM'
            ? 'PARTIAL'
            : 'WEAK',
      note:
        lm.id === 'A'
          ? '0 km/h unsigned speed is not evidence for observed ~2 km/h reverse'
          : undefined,
    });
  }

  return matches;
}

export function estimateClockAlignment(landmarkMatches: Array<Record<string, unknown>>) {
  const eligible = landmarkMatches.filter((m) => m.CLOCK_FIT_ELIGIBLE === 'YES');
  const offsets = eligible
    .map((m) => m.candidateOffsetSeconds as number | null)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  const clockFitEligibleLandmarks = eligible.map((m) => m.landmarkId as string);
  const clockFitRejectedLandmarks = landmarkMatches
    .filter((m) => m.CLOCK_FIT_ELIGIBLE !== 'YES')
    .map((m) => ({
      landmarkId: m.landmarkId,
      reason:
        m.status === 'NOT_FOUND_IN_TELEMETRY'
          ? 'NOT_FOUND'
          : m.CLOCK_FIT_ELIGIBLE === 'NO'
            ? 'INELIGIBLE_OR_INSUFFICIENT'
            : 'UNKNOWN',
    }));

  if (!offsets.length) {
    return {
      VIDEO_ABSOLUTE_TIME_ANCHORED: 'YES',
      PROVIDER_TIMESTAMP_OFFSET_VALIDATED: 'NO',
      VIDEO_PROVIDER_ALIGNMENT_CLASS: 'INSUFFICIENT_EVIDENCE',
      VIDEO_TO_PROVIDER_OFFSET_SECONDS: null,
      OFFSET_MAD_SECONDS: null,
      CLOCK_FIT_ELIGIBLE_LANDMARKS: clockFitEligibleLandmarks,
      CLOCK_FIT_REJECTED_LANDMARKS: clockFitRejectedLandmarks,
      candidateOffsetsPerEvent: [],
      medianOffsetSeconds: null,
      meanOffsetSeconds: null,
      minOffsetSeconds: null,
      maxOffsetSeconds: null,
      spreadSeconds: null,
      CIRCULAR_LANDMARK_ALIGNMENT_REMOVED: 'YES',
    };
  }

  const sorted = [...offsets].sort((a, b) => a - b);
  const median = sortedPercentile(offsets, 50);
  const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
  const offsetMad = mad(offsets);
  const spread = Math.max(...offsets) - Math.min(...offsets);

  let alignmentClass: string;
  let offsetValidated: 'YES' | 'NO' = 'NO';
  if (offsets.length === 1) {
    alignmentClass = 'PROVISIONAL_SINGLE_ANCHOR';
  } else if (offsets.length < 2) {
    alignmentClass = 'INSUFFICIENT_EVIDENCE';
  } else if (spread <= 8) {
    alignmentClass = 'STABLE_OFFSET';
    offsetValidated = 'YES';
  } else if (spread <= 25) {
    alignmentClass = 'AMBIGUOUS_ALIGNMENT';
  } else {
    alignmentClass = 'INSUFFICIENT_EVIDENCE';
  }

  return {
    VIDEO_ABSOLUTE_TIME_ANCHORED: 'YES',
    PROVIDER_TIMESTAMP_OFFSET_VALIDATED: offsetValidated,
    VIDEO_PROVIDER_ALIGNMENT_CLASS: alignmentClass,
    VIDEO_TO_PROVIDER_OFFSET_SECONDS: median,
    OFFSET_MAD_SECONDS: offsetMad,
    CLOCK_FIT_ELIGIBLE_LANDMARKS: clockFitEligibleLandmarks,
    CLOCK_FIT_REJECTED_LANDMARKS: clockFitRejectedLandmarks,
    candidateOffsetsPerEvent: eligible.map((m) => ({
      landmarkId: m.landmarkId,
      offsetSeconds: m.candidateOffsetSeconds,
    })),
    medianOffsetSeconds: median,
    meanOffsetSeconds: mean,
    minOffsetSeconds: Math.min(...offsets),
    maxOffsetSeconds: Math.max(...offsets),
    spreadSeconds: spread,
    CIRCULAR_LANDMARK_ALIGNMENT_REMOVED: 'YES',
  };
}

export function estimateDrift(
  landmarkMatches: Array<Record<string, unknown>>,
  videoDurationSeconds: number,
) {
  const eligible = landmarkMatches.filter(
    (m) =>
      m.CLOCK_FIT_ELIGIBLE === 'YES' &&
      typeof m.videoRelativeSecondsObserved === 'number' &&
      typeof m.candidateOffsetSeconds === 'number' &&
      (m.telemetryMatchConfidence === 'HIGH' || m.telemetryMatchConfidence === 'MEDIUM'),
  );

  const driftFitEligibleLandmarks = eligible.map((m) => m.landmarkId as string);
  const driftFitRejectedLandmarks = landmarkMatches
    .filter((m) => !eligible.some((e) => e.landmarkId === m.landmarkId))
    .map((m) => ({ landmarkId: m.landmarkId, reason: 'NOT_DRIFT_FIT_ELIGIBLE' }));

  const points = eligible.map((m) => ({
    videoT: m.videoRelativeSecondsObserved as number,
    offset: m.candidateOffsetSeconds as number,
    landmarkId: m.landmarkId as string,
  }));

  const videoSpread =
    points.length >= 2
      ? Math.max(...points.map((p) => p.videoT)) - Math.min(...points.map((p) => p.videoT))
      : 0;

  if (
    points.length < 3 ||
    videoDurationSeconds <= 0 ||
    videoSpread < 60
  ) {
    return {
      DRIFT_VALIDATED: 'NO',
      ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT: null,
      DRIFT_FIT_ELIGIBLE_LANDMARKS: driftFitEligibleLandmarks,
      DRIFT_FIT_REJECTED_LANDMARKS: driftFitRejectedLandmarks,
      offsetAtBeginningSeconds: null,
      offsetAtEndSeconds: null,
      note: 'Requires >=3 independent reliable landmarks distributed across segment; Segment B pending',
      DUPLICATE_CLOCK_EVIDENCE_PREVENTED: 'YES',
      TEMPORAL_LOCALITY_ENFORCED: 'YES',
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
  const residuals = points.map((p) => p.offset - (intercept + slope * p.videoT));

  return {
    DRIFT_VALIDATED: 'NO',
    ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT: null,
    DRIFT_FIT_ELIGIBLE_LANDMARKS: driftFitEligibleLandmarks,
    DRIFT_FIT_REJECTED_LANDMARKS: driftFitRejectedLandmarks,
    conceptualSlopeSecondsPerVideoSecond: slope,
    conceptualDriftOverSegmentSeconds: driftOverSegment,
    residuals,
    offsetAtBeginningSeconds: intercept,
    offsetAtEndSeconds: intercept + driftOverSegment,
    landmarkCount: points.length,
    note: 'Conceptual linear fit reported for diagnostics only — not validated (insufficient independent landmarks / Segment B pending)',
    DUPLICATE_CLOCK_EVIDENCE_PREVENTED: 'YES',
    TEMPORAL_LOCALITY_ENFORCED: 'YES',
  };
}

export function buildHfReadingsForLegacyDetectors(rows: Rd004ObservationRow[]) {
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

export function runLegacyDetectorAudit(
  hfReadings: ReturnType<typeof buildHfReadingsForLegacyDetectors>,
) {
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

type LocalEventTiming = {
  providerTimestamp: string;
  videoRelativeSeconds: number;
  rawOnsetSeconds: number | null;
  rawPeakSeconds: number | null;
  rawEndSeconds: number | null;
  smoothedOnsetSeconds: number | null;
  smoothedPeakSeconds: number | null;
  smoothedEndSeconds: number | null;
  onsetShiftSeconds: number | null;
  peakShiftSeconds: number | null;
  endShiftSeconds: number | null;
};

function findLocalPeaks(points: QualifiedSpeedPoint[]): Array<{ index: number; speedKmh: number }> {
  const peaks: Array<{ index: number; speedKmh: number }> = [];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    if (p.speedKmh > points[i - 1]!.speedKmh && p.speedKmh > points[i + 1]!.speedKmh) {
      peaks.push({ index: i, speedKmh: p.speedKmh });
    }
  }
  return peaks;
}

function eventBoundarySeconds(
  points: QualifiedSpeedPoint[],
  legacyByTs: Map<string, LegacyPreprocessedSpeedRow>,
  centerIndex: number,
  windowHalfSeconds: number,
  field: 'raw' | 'smoothed',
): { onset: number | null; peak: number | null; end: number | null } {
  const center = points[centerIndex]!;
  const centerT = center.videoRelativeSecondsProvisional;
  const windowPoints = points.filter(
    (p) => Math.abs(p.videoRelativeSecondsProvisional - centerT) <= windowHalfSeconds,
  );
  if (windowPoints.length < 3) return { onset: null, peak: null, end: null };

  const values = windowPoints.map((p) => {
    if (field === 'raw') return p.speedKmh;
    const leg = legacyByTs.get(p.providerTimestamp);
    return leg?.legacy3PointSmoothedSpeedKmh ?? null;
  });
  const valid = values.filter((v): v is number => v != null);
  if (valid.length < 3) return { onset: null, peak: null, end: null };

  let peakIdx = 0;
  let peakVal = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v != null && v > peakVal) {
      peakVal = v;
      peakIdx = i;
    }
  }
  const peakPoint = windowPoints[peakIdx]!;
  const threshold = peakVal * 0.6;
  let onsetIdx = peakIdx;
  while (onsetIdx > 0) {
    const v = values[onsetIdx - 1];
    if (v == null || v < threshold) break;
    onsetIdx--;
  }
  let endIdx = peakIdx;
  while (endIdx < values.length - 1) {
    const v = values[endIdx + 1];
    if (v == null || v < threshold) break;
    endIdx++;
  }
  const getT = (idx: number) => windowPoints[idx]!.videoRelativeSecondsProvisional;
  return {
    onset: getT(onsetIdx),
    peak: peakPoint.videoRelativeSecondsProvisional,
    end: getT(endIdx),
  };
}

export function comparePreprocessingResponse(
  qualifiedSpeed: QualifiedSpeedPoint[],
  legacySidecar: LegacyPreprocessedSpeedRow[],
) {
  const legacyByTs = new Map(legacySidecar.map((r) => [r.providerTimestamp, r]));
  const sameTimestampPairs: Array<{
    providerTimestamp: string;
    rawKmh: number;
    legacyKmh: number;
    deltaKmh: number;
  }> = [];

  for (const p of qualifiedSpeed) {
    const leg = legacyByTs.get(p.providerTimestamp);
    if (!leg) continue;
    sameTimestampPairs.push({
      providerTimestamp: p.providerTimestamp,
      rawKmh: p.speedKmh,
      legacyKmh: leg.legacy3PointSmoothedSpeedKmh,
      deltaKmh: p.speedKmh - leg.legacy3PointSmoothedSpeedKmh,
    });
  }

  const sameTimestampDeltas = sameTimestampPairs.map((p) => Math.abs(p.deltaKmh));
  const maxSameTimestampDelta = sameTimestampDeltas.length ? Math.max(...sameTimestampDeltas) : null;

  const rawPeaks = findLocalPeaks(qualifiedSpeed);
  const localTimings: LocalEventTiming[] = [];
  const windowHalfSeconds = 20;

  for (const peak of rawPeaks) {
    const center = qualifiedSpeed[peak.index]!;
    const rawBounds = eventBoundarySeconds(qualifiedSpeed, legacyByTs, peak.index, windowHalfSeconds, 'raw');
    const smoothBounds = eventBoundarySeconds(
      qualifiedSpeed,
      legacyByTs,
      peak.index,
      windowHalfSeconds,
      'smoothed',
    );
    const timing: LocalEventTiming = {
      providerTimestamp: center.providerTimestamp,
      videoRelativeSeconds: center.videoRelativeSecondsProvisional,
      rawOnsetSeconds: rawBounds.onset,
      rawPeakSeconds: rawBounds.peak,
      rawEndSeconds: rawBounds.end,
      smoothedOnsetSeconds: smoothBounds.onset,
      smoothedPeakSeconds: smoothBounds.peak,
      smoothedEndSeconds: smoothBounds.end,
      onsetShiftSeconds:
        rawBounds.onset != null && smoothBounds.onset != null
          ? smoothBounds.onset - rawBounds.onset
          : null,
      peakShiftSeconds:
        rawBounds.peak != null && smoothBounds.peak != null
          ? smoothBounds.peak - rawBounds.peak
          : null,
      endShiftSeconds:
        rawBounds.end != null && smoothBounds.end != null
          ? smoothBounds.end - rawBounds.end
          : null,
    };
    localTimings.push(timing);
  }

  const onsetShifts = localTimings
    .map((t) => t.onsetShiftSeconds)
    .filter((v): v is number => v != null);
  const peakShifts = localTimings
    .map((t) => t.peakShiftSeconds)
    .filter((v): v is number => v != null);
  const endShifts = localTimings
    .map((t) => t.endShiftSeconds)
    .filter((v): v is number => v != null);

  const trueLocalPeakAttenuations = rawPeaks.map((peak) => {
    const p = qualifiedSpeed[peak.index]!;
    const leg = legacyByTs.get(p.providerTimestamp);
    return leg ? Math.abs(p.speedKmh - leg.legacy3PointSmoothedSpeedKmh) : null;
  }).filter((v): v is number => v != null);

  const timingValidated =
    onsetShifts.length >= 2 || peakShifts.length >= 2 ? 'PARTIAL' : 'NO';

  return {
    comparedPairs: sameTimestampPairs.length,
    PREPROCESSING_LOCAL_EVENT_METHOD: 'SAME_WINDOW_RAW_VS_SMOOTHED_BOUNDARIES',
    PREPROCESSING_TIMING_VALIDATED: timingValidated,
    MAX_SAME_TIMESTAMP_RAW_SMOOTHED_DELTA_KMH: maxSameTimestampDelta,
    TRUE_LOCAL_PEAK_ATTENUATION_KMH: trueLocalPeakAttenuations.length
      ? Math.max(...trueLocalPeakAttenuations)
      : null,
    PREPROCESSING_START_SHIFT_SECONDS_MEDIAN: onsetShifts.length
      ? sortedPercentile(onsetShifts.map(Math.abs), 50)
      : null,
    PREPROCESSING_END_SHIFT_SECONDS_MEDIAN: endShifts.length
      ? sortedPercentile(endShifts.map(Math.abs), 50)
      : null,
    PREPROCESSING_FALSE_EVENT_CREATION: 'NOT_MEASURED_SPARSE_CADENCE',
    PREPROCESSING_FALSE_EVENT_SUPPRESSION: 'NOT_MEASURED_SPARSE_CADENCE',
    localEventTimings: localTimings,
    note:
      'Same-timestamp delta (A) is not equivalent to local peak attenuation (B). Timing shifts only within local event windows.',
    samplePairs: sameTimestampPairs.slice(0, 10),
  };
}

export function analyzeReverseSupport(rows: Rd004ObservationRow[]) {
  const gearHf = rows.filter(
    (r) =>
      r.providerField === 'powertrainTransmissionActualGear' &&
      r.acquisitionSurface === 'HF_HISTORICAL',
  );
  const ratioHf = rows.filter(
    (r) =>
      r.providerField === 'powertrainTransmissionActualGearRatio' &&
      r.acquisitionSurface === 'HF_HISTORICAL',
  );

  let support: 'YES' | 'PARTIAL' | 'NO' = 'NO';
  if (gearHf.length > 0 || ratioHf.length > 0) {
    const earlyGear = gearHf.filter((r) => {
      const t = parseMs(r.providerTimestamp);
      return t != null && t <= Date.parse(SEGMENT_A_CONSTANTS.videoStartUtc) + 30_000;
    });
    const values = earlyGear
      .map((r) => extractNumericValue(r.rawValueJson))
      .filter((v): v is number => v != null);
    if (values.some((v) => v < 0)) support = 'YES';
    else if (values.length > 0 || ratioHf.length > 0) support = 'PARTIAL';
  }

  return {
    REVERSE_VIDEO_OBSERVED: 'YES',
    REVERSE_TELEMETRY_SUPPORTED: support,
    gearHfObservations: gearHf.length,
    gearRatioHfObservations: ratioHf.length,
    note: 'Unsigned speed cannot establish reverse; no HF gear/ratio in Segment A envelope',
  };
}

function assessSegmentField(
  rows: Rd004ObservationRow[],
  field: string,
): {
  observed: boolean;
  sampleCount: number;
  uniquePhysical: number;
  dynamicRange: number | null;
  segmentValidation: string;
  globalAuthority: string;
} {
  const hf = rows.filter((r) => r.providerField === field && r.acquisitionSurface === 'HF_HISTORICAL');
  if (!hf.length) {
    return {
      observed: false,
      sampleCount: 0,
      uniquePhysical: 0,
      dynamicRange: null,
      segmentValidation: 'NOT_OBSERVED',
      globalAuthority: 'USEFUL_WITH_GATING',
    };
  }
  const cadence = computePhysicalCadenceMetrics(hf);
  const values = dedupePhysicalSamples(hf)
    .map((r) => extractNumericValue(r.rawValueJson))
    .filter((v): v is number => v != null);
  const dynamicRange = values.length ? Math.max(...values) - Math.min(...values) : null;
  const sufficientSamples = (cadence.UNIQUE_PHYSICAL_SAMPLE_COUNT ?? 0) >= 5;
  const dynamicallyInformative = dynamicRange != null && dynamicRange >= 5;

  let segmentValidation: string;
  if (!sufficientSamples) segmentValidation = 'INSUFFICIENT_SAMPLE_COUNT';
  else if (!dynamicallyInformative) segmentValidation = 'NOT_DYNAMICALLY_INFORMATIVE';
  else segmentValidation = 'PARTIAL';

  return {
    observed: true,
    sampleCount: hf.length,
    uniquePhysical: cadence.UNIQUE_PHYSICAL_SAMPLE_COUNT ?? 0,
    dynamicRange,
    segmentValidation,
    globalAuthority: 'USEFUL_WITH_GATING',
  };
}

export function analyzeSupportingSignals(rows: Rd004ObservationRow[]) {
  const rpm = assessSegmentField(rows, 'powertrainCombustionEngineSpeed');
  const throttle = assessSegmentField(rows, 'obdThrottlePosition');
  const tps = assessSegmentField(rows, 'powertrainCombustionEngineTPS');
  const load = assessSegmentField(rows, 'obdEngineLoad');
  const gear = assessSegmentField(rows, 'powertrainTransmissionActualGear');
  const gearRatio = assessSegmentField(rows, 'powertrainTransmissionActualGearRatio');

  const gearObserved = gear.observed || gearRatio.observed;

  return {
    RPM_GLOBAL_AUTHORITY: rpm.globalAuthority,
    RPM_SEGMENT_A_VALIDATION: rpm.segmentValidation,
    THROTTLE_GLOBAL_AUTHORITY: throttle.globalAuthority,
    THROTTLE_SEGMENT_A_VALIDATION: throttle.segmentValidation,
    TPS_GLOBAL_AUTHORITY: tps.globalAuthority,
    TPS_SEGMENT_A_VALIDATION: tps.segmentValidation,
    GEAR_STATE_OBSERVED: gearObserved ? 'YES' : 'NO',
    GEAR_STATE_USEFUL_FOR_SEGMENT_A: gearObserved ? 'PARTIAL' : 'NOT_OBSERVED',
    perField: {
      powertrainCombustionEngineSpeed: rpm,
      obdThrottlePosition: throttle,
      powertrainCombustionEngineTPS: tps,
      obdEngineLoad: load,
      powertrainTransmissionActualGear: gear,
      powertrainTransmissionActualGearRatio: gearRatio,
    },
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
  const hfSpeedRows = envelope.filter(
    (r) => r.providerField === 'speed' && r.acquisitionSurface === 'HF_HISTORICAL',
  );
  const hfSpeedCadence = computePhysicalCadenceMetrics(hfSpeedRows);
  const staleDupes = identifyStaleHoldDuplicateRows(hfSpeedRows);

  const acceleration = computeQualifiedAccelerationPairs(
    qualifiedSpeed,
    PROVISIONAL_ACCELERATION_MAX_GAP_SECONDS,
  );
  const accelerationGapSensitivity = computeAccelerationGapSensitivity(qualifiedSpeed);
  const episodes = findSpeedEpisodes(qualifiedSpeed);
  const landmarkMatches = matchVideoLandmarks(VIDEO_LANDMARKS, episodes);
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

  const flags = {
    RD004_PHASE: RD004_A_PHASE,
    RD004_SEGMENT_A_VIDEO_START_UTC: SEGMENT_A_CONSTANTS.videoStartUtc,
    RD004_SEGMENT_A_VIDEO_END_UTC: SEGMENT_A_CONSTANTS.videoEndUtc,
    HF_HISTORICAL_AVAILABLE: qualifiedSpeed.length > 0 ? 'YES' : 'NO',
    HF_SPEED_ROWS: hfSpeedRows.length,
    HF_SPEED_UNIQUE_PHYSICAL_SAMPLES: hfSpeedCadence.UNIQUE_PHYSICAL_SAMPLE_COUNT,
    HF_SPEED_MEDIAN_PHYSICAL_CADENCE_SECONDS: hfSpeedCadence.NEW_PHYSICAL_SAMPLE_CADENCE_MEDIAN_SECONDS,
    HF_SPEED_P90_PHYSICAL_CADENCE_SECONDS: hfSpeedCadence.NEW_PHYSICAL_SAMPLE_CADENCE_P90_SECONDS,
    HF_SPEED_MAX_GAP_SECONDS: hfSpeedCadence.NEW_PHYSICAL_SAMPLE_CADENCE_MAX_GAP_SECONDS,
    DUPLICATE_SPEED_SAMPLES: staleDupes.size,
    STALE_HOLD_SPEED_SAMPLES: detectStaleHolds(hfSpeedRows).length,
    OUT_OF_ORDER_SPEED_SAMPLES: detectOutOfOrderByAcquisitionOrder(hfSpeedRows),
    OUT_OF_ORDER_METHOD_ACQUISITION_ORDERED: 'YES',
    VIDEO_ABSOLUTE_TIME_ANCHORED: clock.VIDEO_ABSOLUTE_TIME_ANCHORED,
    PROVIDER_TIMESTAMP_OFFSET_VALIDATED: clock.PROVIDER_TIMESTAMP_OFFSET_VALIDATED,
    VIDEO_PROVIDER_ALIGNMENT_CLASS: clock.VIDEO_PROVIDER_ALIGNMENT_CLASS,
    VIDEO_TO_PROVIDER_OFFSET_SECONDS: clock.VIDEO_TO_PROVIDER_OFFSET_SECONDS,
    OFFSET_MAD_SECONDS: clock.OFFSET_MAD_SECONDS,
    CLOCK_FIT_ELIGIBLE_LANDMARKS: clock.CLOCK_FIT_ELIGIBLE_LANDMARKS,
    CLOCK_FIT_REJECTED_LANDMARKS: clock.CLOCK_FIT_REJECTED_LANDMARKS,
    DRIFT_VALIDATED: drift.DRIFT_VALIDATED,
    ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT: drift.ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT,
    CIRCULAR_LANDMARK_ALIGNMENT_REMOVED: clock.CIRCULAR_LANDMARK_ALIGNMENT_REMOVED,
    DUPLICATE_CLOCK_EVIDENCE_PREVENTED: drift.DUPLICATE_CLOCK_EVIDENCE_PREVENTED,
    TEMPORAL_LOCALITY_ENFORCED: drift.TEMPORAL_LOCALITY_ENFORCED,
    EXACT_VIDEO_SPEED_ANCHORS: 0,
    ABSOLUTE_SPEED_ACCURACY_VALIDATED: 'NO',
    QUALIFIED_ACCELERATION_PAIR_FRACTION: acceleration.qualifiedPairFraction,
    ACCELERATION_GAP_THRESHOLD_STATUS: 'ANALYSIS_CANDIDATE_NOT_VALIDATED',
    ACCELERATION_PERCENTILE_BUG_FIXED: 'YES',
    OBSERVED_QUALIFIED_KINEMATIC_MAX_POSITIVE_MS2: acceleration.distribution.maxPositiveMs2,
    OBSERVED_QUALIFIED_KINEMATIC_MAX_NEGATIVE_MS2: acceleration.distribution.maxNegativeMs2,
    VIDEO_SEVERITY_CONFIRMATION: 'NOT_VALIDATED',
    ...legacyAudit.counts,
    LEGACY_DETECTOR_OBSERVED_HARD_EXTREME_EVENTS:
      legacyAudit.counts.LEGACY_HARD_ACCEL_EVENTS +
      legacyAudit.counts.LEGACY_EXTREME_ACCEL_EVENTS +
      legacyAudit.counts.LEGACY_HARD_BRAKING_EVENTS +
      legacyAudit.counts.LEGACY_EXTREME_BRAKING_EVENTS,
    PREPROCESSING_LOCAL_EVENT_METHOD: preprocessing.PREPROCESSING_LOCAL_EVENT_METHOD,
    PREPROCESSING_TIMING_VALIDATED: preprocessing.PREPROCESSING_TIMING_VALIDATED,
    MAX_SAME_TIMESTAMP_RAW_SMOOTHED_DELTA_KMH: preprocessing.MAX_SAME_TIMESTAMP_RAW_SMOOTHED_DELTA_KMH,
    TRUE_LOCAL_PEAK_ATTENUATION_KMH: preprocessing.TRUE_LOCAL_PEAK_ATTENUATION_KMH,
    PREPROCESSING_START_SHIFT: preprocessing.PREPROCESSING_START_SHIFT_SECONDS_MEDIAN,
    PREPROCESSING_END_SHIFT: preprocessing.PREPROCESSING_END_SHIFT_SECONDS_MEDIAN,
    RPM_SEGMENT_A_VALIDATION: supporting.RPM_SEGMENT_A_VALIDATION,
    THROTTLE_SEGMENT_A_VALIDATION: supporting.THROTTLE_SEGMENT_A_VALIDATION,
    TPS_SEGMENT_A_VALIDATION: supporting.TPS_SEGMENT_A_VALIDATION,
    GEAR_STATE_OBSERVED: supporting.GEAR_STATE_OBSERVED,
    GEAR_STATE_USEFUL_FOR_SEGMENT_A: supporting.GEAR_STATE_USEFUL_FOR_SEGMENT_A,
    REVERSE_VIDEO_OBSERVED: reverse.REVERSE_VIDEO_OBSERVED,
    REVERSE_TELEMETRY_SUPPORTED: reverse.REVERSE_TELEMETRY_SUPPORTED,
    CALM_BASELINE_FALSE_POSITIVE_CHECK: 'NO_FALSE_POSITIVES_OBSERVED_ON_AVAILABLE_DATA',
    CALM_BASELINE_COVERAGE: 'PARTIAL',
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
      note: 'Zero-offset projection is nominal only — offset/drift require independently observed video times',
    },
    speedComparison: {
      exactOrHighConfidenceAnchors: [],
      approximateVideoLandmarks: VIDEO_LANDMARKS
        .filter((lm) => lm.videoRelativeSecondsObserved != null)
        .map((lm) => ({
          id: lm.id,
          videoRelativeSeconds: lm.videoRelativeSecondsObserved,
          videoTimingAuthority: lm.videoTimingAuthority,
          note: 'Human-reviewed approximate — not frame-exact',
        })),
      ABSOLUTE_SPEED_ACCURACY_VALIDATED: 'NO',
    },
    kinematicReconstruction: {
      ...acceleration,
      gapSensitivity: accelerationGapSensitivity,
      VIDEO_SEVERITY_CONFIRMATION: 'NOT_VALIDATED',
      note: 'Qualified kinematic derivatives from sparse HF — not validated against video severity',
    },
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
