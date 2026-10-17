/**
 * LDI-10D Phase 3E.9 — OCR quality, freeze validation, pair audit (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import { loadCommittedFixture } from './ldi10d-phase3c2-tesla-gps-fixture.lib';
import { findNearestFixtureBucket, parseOverlayOcrText, TESLA_TRIP_LAT_MAX, TESLA_TRIP_LAT_MIN } from './ldi10d-phase3e4-iphone-gps-forensics.lib';
import { LON_MAX, LON_MIN } from './ldi10d-phase3e5-mov-ocr-validation.lib';
import {
  EXPECTED_1HZ,
  loadCheckpoint,
  OcrCheckpointRow,
  runPhase3e8Analysis,
  verifyPhase3e8Preflight,
} from './ldi10d-phase3e8-full-video-forensics.lib';
import { POSITION_PAYLOAD_SHA256 } from './ldi10d-phase3c1-tesla-gps-comparative-replay.lib';

export const SAMPLE_SEED = 392019;
export const SAMPLE_PER_VIDEO = 8;
export const PHASE3E8_RESULT_REL = 'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3E8_RESULT.md';

export type EnrichedRow = OcrCheckpointRow & {
  video: string;
  dimoH: number | null;
  dimoBucketUtc: string | null;
  dimoSpeedKmh: number | null;
  impliedSpeedKmh: number | null;
  freezePoint3e8: boolean;
};

export type FreezeSegmentClass =
  | 'REAL_OVERLAY_GPS_FREEZE'
  | 'OCR_STALE_COORD_REPEAT'
  | 'OCR_SPEED_ONLY_ARTIFACT'
  | 'LEGIT_LOW_SPEED_STATIC'
  | 'AMBIGUOUS_MIXED';

export type FreezePointRecord = {
  videoNum: string;
  secondIndex: number;
  durationSecInRun: number;
  runStartSec: number;
  lat: number;
  lon: number;
  speedKmh: number | null;
  prevSpeedKmh: number | null;
  impliedSpeedKmh: number | null;
  dimoHaversineM: number | null;
  segmentClass: FreezeSegmentClass;
  evidenceQuality: 'HIGH' | 'MEDIUM' | 'LOW';
  coordinateSequence: string;
};

export type StopClass = 'OBSERVED' | 'CONTEXT_SUPPORTED' | 'INFERRED' | 'UNKNOWN';

function spatialStats(dists: number[]) {
  const s = [...dists].sort((a, b) => a - b);
  const pct = (p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null);
  return {
    n: s.length,
    medianM: s.length ? s[Math.floor(s.length / 2)] : null,
    p90M: pct(0.9),
    p95M: pct(0.95),
    p99M: pct(0.99),
    maxM: s.length ? s[s.length - 1] : null,
  };
}

export function inCorridor(r: { lat: number | null; lon: number | null }): boolean {
  return (
    r.lat != null &&
    r.lon != null &&
    r.lat >= TESLA_TRIP_LAT_MIN &&
    r.lat <= TESLA_TRIP_LAT_MAX &&
    r.lon >= LON_MIN &&
    r.lon <= LON_MAX
  );
}

export function isFullyReadable(r: OcrCheckpointRow): boolean {
  return (
    inCorridor(r) &&
    !!r.overlay_local &&
    r.iphone_speed_kmh != null &&
    r.ocr_class !== 'OCR_FAILED'
  );
}

export function enrichCheckpoint(repoRoot: string): EnrichedRow[] {
  const rows = loadCheckpoint(repoRoot);
  const fixture = loadCommittedFixture(repoRoot);
  const videoMap: Record<string, string> = {
    '62': 'TC_00062.MOV',
    '63': 'TC_00063.MOV',
    '64': 'TC_00064.MOV',
    '65': 'TC_00065.MOV',
    '66': 'TC_00066.MOV',
    '67': 'TC_00067.MOV',
  };
  const out: EnrichedRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const prev = i > 0 ? rows[i - 1]! : null;
    let dimoH: number | null = null;
    let dimoBucketUtc: string | null = null;
    let dimoSpeedKmh: number | null = null;
    const utc = r.sync_utc_from_metadata;
    if (r.lat != null && r.lon != null && utc) {
      const near = findNearestFixtureBucket(utc, fixture.buckets, 2);
      if (near?.bucket.latitude != null) {
        dimoH = haversineMeters(r.lat, r.lon, near.bucket.latitude!, near.bucket.longitude!);
        dimoBucketUtc = near.bucket.bucketLabelUtc;
        dimoSpeedKmh = near.bucket.pinnedProductionL3Kmh ?? null;
      }
    }
    let implied: number | null = null;
    if (prev && prev.video_num === r.video_num && prev.lat != null && r.lat != null && prev.lon != null && r.lon != null) {
      const dt = r.second_index - prev.second_index;
      if (dt > 0) {
        implied = (haversineMeters(prev.lat, prev.lon, r.lat, r.lon) / dt) * 3.6;
      }
    }
    const freezePoint3e8 =
      !!prev &&
      prev.video_num === r.video_num &&
      prev.lat === r.lat &&
      prev.lon === r.lon &&
      r.lat != null &&
      (prev.iphone_speed_kmh ?? 0) !== (r.iphone_speed_kmh ?? 0);
    out.push({
      ...r,
      video: videoMap[r.video_num] ?? `TC_${r.video_num}.MOV`,
      dimoH,
      dimoBucketUtc,
      dimoSpeedKmh,
      impliedSpeedKmh: implied,
      freezePoint3e8,
    });
  }
  return out;
}

function classifyFreezeSegment(run: EnrichedRow[]): FreezeSegmentClass {
  const speeds = run.map((r) => r.iphone_speed_kmh ?? 0);
  const maxSp = Math.max(...speeds);
  const minSp = Math.min(...speeds);
  const implied = run.map((r) => r.impliedSpeedKmh ?? 0);
  const maxImpl = Math.max(...implied);
  if (maxSp <= 3 && run.length >= 2) return 'LEGIT_LOW_SPEED_STATIC';
  if (maxImpl > 15 && maxSp > 5) return 'OCR_STALE_COORD_REPEAT';
  if (maxSp - minSp > 20 && maxImpl < 5) return 'REAL_OVERLAY_GPS_FREEZE';
  if (maxSp - minSp > 5 && maxImpl < 3) return 'OCR_SPEED_ONLY_ARTIFACT';
  return 'AMBIGUOUS_MIXED';
}

export function auditFreezeCandidates(rows: EnrichedRow[]): {
  points3e8: number;
  segments: Array<{ videoNum: string; startSec: number; endSec: number; durationSec: number; class: FreezeSegmentClass; pointCount: number }>;
  pointRecords: FreezePointRecord[];
  byClass: Record<FreezeSegmentClass, number>;
} {
  const pointRecords: FreezePointRecord[] = [];
  const segments: Array<{
    videoNum: string;
    startSec: number;
    endSec: number;
    durationSec: number;
    class: FreezeSegmentClass;
    pointCount: number;
  }> = [];

  let i = 0;
  while (i < rows.length) {
    const r = rows[i]!;
    if (r.lat == null || r.lon == null) {
      i++;
      continue;
    }
    const run: EnrichedRow[] = [r];
    let j = i + 1;
    while (j < rows.length) {
      const n = rows[j]!;
      if (n.video_num !== r.video_num || n.lat !== r.lat || n.lon !== r.lon) break;
      run.push(n);
      j++;
    }
    if (run.length >= 2) {
      const cls = classifyFreezeSegment(run);
      segments.push({
        videoNum: r.video_num,
        startSec: r.second_index,
        endSec: run[run.length - 1]!.second_index,
        durationSec: run.length,
        class: cls,
        pointCount: run.length,
      });
      for (let k = 1; k < run.length; k++) {
        const cur = run[k]!;
        const prev = run[k - 1]!;
        if ((prev.iphone_speed_kmh ?? 0) !== (cur.iphone_speed_kmh ?? 0)) {
          const seq = run
            .slice(Math.max(0, k - 2), Math.min(run.length, k + 3))
            .map((x) => `${x.second_index}:${x.iphone_speed_kmh}`)
            .join('|');
          pointRecords.push({
            videoNum: cur.video_num,
            secondIndex: cur.second_index,
            durationSecInRun: run.length,
            runStartSec: r.second_index,
            lat: cur.lat!,
            lon: cur.lon!,
            speedKmh: cur.iphone_speed_kmh,
            prevSpeedKmh: prev.iphone_speed_kmh,
            impliedSpeedKmh: cur.impliedSpeedKmh,
            dimoHaversineM: cur.dimoH,
            segmentClass: cls,
            evidenceQuality: cls === 'REAL_OVERLAY_GPS_FREEZE' ? 'MEDIUM' : cls === 'LEGIT_LOW_SPEED_STATIC' ? 'HIGH' : 'LOW',
            coordinateSequence: seq,
          });
        }
      }
    }
    i = j > i + 1 ? j : i + 1;
  }

  const byClass: Record<FreezeSegmentClass, number> = {
    REAL_OVERLAY_GPS_FREEZE: 0,
    OCR_STALE_COORD_REPEAT: 0,
    OCR_SPEED_ONLY_ARTIFACT: 0,
    LEGIT_LOW_SPEED_STATIC: 0,
    AMBIGUOUS_MIXED: 0,
  };
  for (const s of segments) byClass[s.class] += s.pointCount;

  return { points3e8: rows.filter((r) => r.freezePoint3e8).length, segments, pointRecords, byClass };
}

export function classifyStopCandidates(rows: EnrichedRow[]): Array<{
  videoNum: string;
  secondIndex: number;
  stopClass: StopClass;
  speedKmh: number | null;
  lat: number | null;
  lon: number | null;
  dimoSpeedKmh: number | null;
  consecutiveLowSpeedSec: number;
  rationale: string;
}> {
  const out: Array<{
    videoNum: string;
    secondIndex: number;
    stopClass: StopClass;
    speedKmh: number | null;
    lat: number | null;
    lon: number | null;
    dimoSpeedKmh: number | null;
    consecutiveLowSpeedSec: number;
    rationale: string;
  }> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.iphone_speed_kmh == null) continue;
    if (r.iphone_speed_kmh >= 2) continue;
    if (!inCorridor(r)) {
      out.push({
        videoNum: r.video_num,
        secondIndex: r.second_index,
        stopClass: 'UNKNOWN',
        speedKmh: r.iphone_speed_kmh,
        lat: r.lat,
        lon: r.lon,
        dimoSpeedKmh: r.dimoSpeedKmh,
        consecutiveLowSpeedSec: 0,
        rationale: 'Low displayed speed but coordinates missing or out of corridor — not OBSERVED standstill',
      });
      continue;
    }
    let consec = 1;
    for (let k = i - 1; k >= 0 && rows[k]!.video_num === r.video_num; k--) {
      if ((rows[k]!.iphone_speed_kmh ?? 99) >= 2) break;
      if (!inCorridor(rows[k]!)) break;
      consec++;
    }
    const coordsStatic =
      consec >= 2 &&
      rows
        .slice(i - consec + 1, i + 1)
        .every((x) => x.lat === r.lat && x.lon === r.lon);
    const dimoLow = r.dimoSpeedKmh != null && r.dimoSpeedKmh < 3;
    let stopClass: StopClass = 'INFERRED';
    let rationale = 'Displayed speed <2 km/h with valid coords';
    if (consec >= 3 && coordsStatic && (r.iphone_speed_kmh ?? 0) <= 1) {
      stopClass = 'OBSERVED';
      rationale = `≥3s consecutive speed ≤1 km/h with unchanged coordinates`;
    } else if (dimoLow && (r.iphone_speed_kmh ?? 0) < 2) {
      stopClass = 'CONTEXT_SUPPORTED';
      rationale = 'Overlay speed <2 and DIMO speed <3 at nearest bucket';
    } else if (r.impliedSpeedKmh != null && r.impliedSpeedKmh > 8) {
      stopClass = 'UNKNOWN';
      rationale = 'Low overlay speed but implied displacement speed high — possible OCR speed error';
    }
    out.push({
      videoNum: r.video_num,
      secondIndex: r.second_index,
      stopClass,
      speedKmh: r.iphone_speed_kmh,
      lat: r.lat,
      lon: r.lon,
      dimoSpeedKmh: r.dimoSpeedKmh,
      consecutiveLowSpeedSec: consec,
      rationale,
    });
  }
  return out;
}

/** Deterministic stratified sample indices (no FRAME_VERIFIED promotion). */
export function selectFrameSampleIndices(rows: EnrichedRow[]): Array<{ videoNum: string; secondIndex: number; ocrClass: string }> {
  const byVideo: Record<string, EnrichedRow[]> = {};
  for (const r of rows.filter(isFullyReadable)) {
    (byVideo[r.video_num] ??= []).push(r);
  }
  const picked: Array<{ videoNum: string; secondIndex: number; ocrClass: string }> = [];
  for (const vn of ['62', '63', '64', '65', '66', '67']) {
    const pool = byVideo[vn] ?? [];
    pool.sort((a, b) => {
      const ha = ((SAMPLE_SEED + a.second_index * 17) % 100000) / 100000;
      const hb = ((SAMPLE_SEED + b.second_index * 17) % 100000) / 100000;
      return ha - hb;
    });
    for (const r of pool.slice(0, SAMPLE_PER_VIDEO)) {
      picked.push({ videoNum: r.video_num, secondIndex: r.second_index, ocrClass: r.ocr_class });
    }
  }
  const partialPool = rows.filter((r) => r.ocr_class === 'OCR_PARTIAL' || r.ocr_class === 'OCR_AMBIGUOUS');
  partialPool.sort((a, b) => ((SAMPLE_SEED + a.second_index) % 99991) - ((SAMPLE_SEED + b.second_index) % 99991));
  for (const r of partialPool.slice(0, 12)) {
    if (!picked.some((p) => p.videoNum === r.video_num && p.secondIndex === r.second_index)) {
      picked.push({ videoNum: r.video_num, secondIndex: r.second_index, ocrClass: r.ocr_class });
    }
  }
  return picked;
}

export type OutlierCause =
  | 'TEMPORAL_MISALIGNMENT'
  | 'OCR_COORD_ERROR'
  | 'IPHONE_GPS_JUMP'
  | 'GENUINE_LARGE_DEVIATION'
  | 'DIMO_MISSING_OR_ROW_ABSENT'
  | 'UNCLASSIFIED';

export function classifyOutlier(row: EnrichedRow, fixture: ReturnType<typeof loadCommittedFixture>): {
  cause: OutlierCause;
  bestShiftSec: number;
  distanceAtBestShiftM: number | null;
  notes: string[];
} {
  const notes: string[] = [];
  if (row.dimoH == null || !row.sync_utc_from_metadata || row.lat == null) {
    return { cause: 'DIMO_MISSING_OR_ROW_ABSENT', bestShiftSec: 0, distanceAtBestShiftM: null, notes: ['No pair distance'] };
  }
  let bestShift = 0;
  let bestD = row.dimoH;
  for (const shift of [-3, -2, -1, 1, 2, 3]) {
    const shifted = new Date(Date.parse(row.sync_utc_from_metadata) + shift * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const near = findNearestFixtureBucket(shifted, fixture.buckets, 1);
    if (!near?.bucket.latitude) continue;
    const d = haversineMeters(row.lat, row.lon!, near.bucket.latitude!, near.bucket.longitude!);
    if (d < bestD) {
      bestD = d;
      bestShift = shift;
    }
  }
  if (bestShift !== 0 && bestD < row.dimoH * 0.5 && bestD < 35) {
    notes.push(`Distance drops from ${row.dimoH.toFixed(1)}m to ${bestD.toFixed(1)}m at shift ${bestShift}s`);
    return { cause: 'TEMPORAL_MISALIGNMENT', bestShiftSec: bestShift, distanceAtBestShiftM: bestD, notes };
  }
  if ((row.impliedSpeedKmh ?? 0) > 80 && row.dimoH > 100) {
    notes.push('Large implied displacement between OCR seconds');
    return { cause: 'IPHONE_GPS_JUMP', bestShiftSec: 0, distanceAtBestShiftM: row.dimoH, notes };
  }
  if (row.ocr_class !== 'OCR_HIGH_CONFIDENCE' && row.dimoH > 80) {
    notes.push(`OCR class ${row.ocr_class}`);
    return { cause: 'OCR_COORD_ERROR', bestShiftSec: 0, distanceAtBestShiftM: row.dimoH, notes };
  }
  if (row.dimoH > 500) {
    return { cause: 'OCR_COORD_ERROR', bestShiftSec: 0, distanceAtBestShiftM: row.dimoH, notes: ['Extreme outlier >500m'] };
  }
  return { cause: 'GENUINE_LARGE_DEVIATION', bestShiftSec: 0, distanceAtBestShiftM: row.dimoH, notes };
}

export function auditPairIndependence(rows: EnrichedRow[]): {
  setAUsesDimoDistanceFilter: false;
  pairedRows: number;
  uniqueDimoBuckets: number;
  duplicateBucketAssignments: number;
  missingDimoJoin: number;
  multiOcrPerBucket: Array<{ bucketUtc: string; count: number }>;
} {
  const paired = rows.filter((r) => inCorridor(r) && r.dimoH != null);
  const bucketMap = new Map<string, number>();
  for (const r of paired) {
    if (!r.dimoBucketUtc) continue;
    bucketMap.set(r.dimoBucketUtc, (bucketMap.get(r.dimoBucketUtc) ?? 0) + 1);
  }
  const multi = [...bucketMap.entries()]
    .filter(([, c]) => c > 1)
    .map(([b, c]) => ({ bucketUtc: b, count: c }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
  const dupCount = [...bucketMap.values()].filter((c) => c > 1).reduce((a, c) => a + (c - 1), 0);
  return {
    setAUsesDimoDistanceFilter: false,
    pairedRows: paired.length,
    uniqueDimoBuckets: bucketMap.size,
    duplicateBucketAssignments: dupCount,
    missingDimoJoin: rows.filter((r) => inCorridor(r) && r.dimoH == null).length,
    multiOcrPerBucket: multi,
  };
}

export function qualityGatedRows(rows: EnrichedRow[]): EnrichedRow[] {
  return rows.filter(
    (r) =>
      isFullyReadable(r) &&
      !r.freezePoint3e8 &&
      (r.dimoH == null || r.dimoH <= 500) &&
      (r.impliedSpeedKmh == null || r.impliedSpeedKmh < 200),
  );
}

export function loadPhase3e8SnapshotMetrics(repoRoot: string): Record<string, unknown> | null {
  const p = path.join(repoRoot, PHASE3E8_RESULT_REL);
  if (!fs.existsSync(p)) return null;
  const m = p.match(/```json\n([\s\S]*?)\n```/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]!) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function runPhase3e9Analysis(repoRoot: string, frameSampleResults: FrameSampleResult[] | null) {
  const preflight = verifyPhase3e8Preflight(repoRoot);
  if (!preflight.ok) throw new Error(`3E.9 preflight: ${preflight.errors.join('; ')}`);
  const fixture = loadCommittedFixture(repoRoot);
  if (fixture.positionPayloadSha256 !== POSITION_PAYLOAD_SHA256) throw new Error('fixture hash mismatch');

  const rows = enrichCheckpoint(repoRoot);
  const p38 = runPhase3e8Analysis(repoRoot);
  const freeze = auditFreezeCandidates(rows);
  const stops = classifyStopCandidates(rows);
  const pairAudit = auditPairIndependence(rows);
  const gated = qualityGatedRows(rows);
  const distBefore = rows.filter((r) => inCorridor(r) && r.dimoH != null).map((r) => r.dimoH!);
  const distAfter = gated.filter((r) => r.dimoH != null).map((r) => r.dimoH!);

  const p95Threshold = spatialStats(distBefore).p95M ?? 64;
  const outliers = rows
    .filter((r) => r.dimoH != null && r.dimoH >= (p95Threshold ?? 64))
    .sort((a, b) => (b.dimoH ?? 0) - (a.dimoH ?? 0))
    .map((r) => ({
      videoNum: r.video_num,
      secondIndex: r.second_index,
      syncUtc: r.sync_utc_from_metadata,
      lat: r.lat,
      lon: r.lon,
      dimoHaversineM: r.dimoH,
      ocrClass: r.ocr_class,
      ...classifyOutlier(r, fixture),
    }));

  const sampleSpec = selectFrameSampleIndices(rows);
  let sampleAudit: {
    selectionRule: string;
    targetCount: number;
    actualImageInspectionCount: number;
    coordMismatchCount: number;
    errorRate: number | null;
    results: FrameSampleResult[];
  } = {
    selectionRule: `SEED=${SAMPLE_SEED}; ${SAMPLE_PER_VIDEO}/video from fully-readable; +12 OCR_PARTIAL/AMBIGUOUS`,
    targetCount: sampleSpec.length,
    actualImageInspectionCount: 0,
    coordMismatchCount: 0,
    errorRate: null,
    results: [],
  };
  if (frameSampleResults) {
    const mism = frameSampleResults.filter((s) => !s.coordWithinTolerance);
    sampleAudit = {
      ...sampleAudit,
      actualImageInspectionCount: frameSampleResults.length,
      coordMismatchCount: mism.length,
      errorRate: frameSampleResults.length ? mism.length / frameSampleResults.length : null,
      results: frameSampleResults,
    };
  }

  return {
    preflight,
    p38Snapshot: loadPhase3e8SnapshotMetrics(repoRoot),
    freeze,
    stops,
    pairAudit,
    outliers,
    spatialBefore: spatialStats(distBefore),
    spatialAfter: spatialStats(distAfter),
    gatedCount: gated.length,
    stopSummary: {
      OBSERVED: stops.filter((s) => s.stopClass === 'OBSERVED').length,
      CONTEXT_SUPPORTED: stops.filter((s) => s.stopClass === 'CONTEXT_SUPPORTED').length,
      INFERRED: stops.filter((s) => s.stopClass === 'INFERRED').length,
      UNKNOWN: stops.filter((s) => s.stopClass === 'UNKNOWN').length,
    },
    sampleSpec,
    sampleAudit,
    fullyReadableCount: rows.filter(isFullyReadable).length,
  };
}

export type FrameSampleResult = {
  videoNum: string;
  secondIndex: number;
  ocrClass: string;
  checkpointLat: number | null;
  checkpointLon: number | null;
  resampleLat: number | null;
  resampleLon: number | null;
  haversineDeltaM: number | null;
  coordWithinTolerance: boolean;
  frameVerifiedPromoted: false;
};

export function evaluateResampleAgainstCheckpoint(
  checkpoint: OcrCheckpointRow,
  parsed: ReturnType<typeof parseOverlayOcrText>,
): { lat: number | null; lon: number | null; within: boolean; deltaM: number | null } {
  const lat = parsed.lat;
  const lon = parsed.lon;
  if (checkpoint.lat == null || checkpoint.lon == null || lat == null || lon == null) {
    return { lat, lon, within: false, deltaM: null };
  }
  const deltaM = haversineMeters(checkpoint.lat, checkpoint.lon, lat, lon);
  return { lat, lon, within: deltaM <= 25, deltaM };
}
