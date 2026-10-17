/**
 * LDI-10D Phase 3E.6 — full-video forensics (offline, fail-closed).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import { POSITION_PAYLOAD_SHA256 } from './ldi10d-phase3c1-tesla-gps-comparative-replay.lib';
import { loadCommittedFixture } from './ldi10d-phase3c2-tesla-gps-fixture.lib';
import {
  loadVideoComparison,
  reproduceVideoBaselineMetrics,
  runPhase3cResearch,
  VIDEO_BASELINE_EXPECTED,
} from './ldi10d-phase3c-gps-speed-research.lib';
import { runPhase3dAnalysis, verifyPhase3dPreflight } from './ldi10d-phase3d-gps-evidence-quality.lib';
import {
  findNearestFixtureBucket,
  TESLA_TRIP_LAT_MAX,
  TESLA_TRIP_LAT_MIN,
} from './ldi10d-phase3e4-iphone-gps-forensics.lib';
import {
  DIMO_CORROBORATION_MAX_M,
  loadMovOcrCsv,
  loadPhase3e4FrameReference,
  loadRoadOutcomesByUtc,
  rawHasExplicitCoord,
  validateMovOcrRows,
  type MovOcrRow,
} from './ldi10d-phase3e5-mov-ocr-validation.lib';
import { LON_MAX, LON_MIN } from './ldi10d-phase3e5-mov-ocr-validation.lib';
import { normalizeOutcome } from './ldi10d-phase3e3-road-matching-accuracy.lib';

export const HANDOFF_REL = 'architecture/drivingintelligence/evidence/ldi-10d/phase3e6-handoff';
export const VIDEO_SECONDS_TOTAL_PINNED = 1027.588333;

export type OcrConfidence = 'VERIFIED' | 'HIGH_CONFIDENCE' | 'PARTIAL' | 'INVALID' | 'MISSING';

export type ClassifiedOcrRow = MovOcrRow & {
  ocrConfidence: OcrConfidence;
  independentEligible: boolean;
  compatibilityEligible: boolean;
  dimoHaversineM: number | null;
  dimoBucketUtc: string | null;
  gpsFreezeSuspected: boolean;
  impliedSpeedFromDisplacementKmh: number | null;
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** Load 3E.6 handoff CSV (same schema as 3E.5 pack). */
export function loadHandoffOcrCsv(repoRoot: string): MovOcrRow[] {
  const p = path.join(repoRoot, HANDOFF_REL, 'iphone_gps_5s_ocr.csv');
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
  const VIDEO_BY_NUM: Record<string, string> = {
    '62': 'TC_00062.MOV',
    '63': 'TC_00063.MOV',
    '64': 'TC_00064.MOV',
    '65': 'TC_00065.MOV',
    '66': 'TC_00066.MOV',
    '67': 'TC_00067.MOV',
  };
  const out: MovOcrRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const videoNum = cols[0] ?? '';
    out.push({
      video: VIDEO_BY_NUM[videoNum] ?? `TC_${videoNum}.MOV`,
      videoNum,
      frameFile: cols[1] ?? '',
      offsetS: parseInt(cols[2] ?? '', 10),
      overlayUtc: cols[3]?.trim() || null,
      lat: cols[4]?.trim() ? parseFloat(cols[4]) : null,
      lon: cols[5]?.trim() ? parseFloat(cols[5]) : null,
      iphoneSpeedKmh: cols[6]?.trim() ? parseFloat(cols[6]) : null,
      ocrStatus: cols[7] ?? '',
      rawOcr: cols[8] ?? '',
    });
  }
  return out;
}

export function classifyOcrConfidence(
  row: MovOcrRow,
  frameRef: Map<string, { lat: number; lon: number }>,
): OcrConfidence {
  if (row.ocrStatus === 'PARTIAL_REVIEW_REQUIRED') return 'PARTIAL';
  if (row.lat == null || row.lon == null || !row.overlayUtc) return 'MISSING';
  if (row.lat < TESLA_TRIP_LAT_MIN || row.lat > TESLA_TRIP_LAT_MAX) return 'INVALID';
  if (row.lon < LON_MIN || row.lon > LON_MAX) return 'INVALID';
  if (!rawHasExplicitCoord(row.rawOcr)) return 'INVALID';
  const ref = frameRef.get(`${row.video}:${row.offsetS}`);
  if (ref && haversineMeters(row.lat, row.lon, ref.lat, ref.lon) <= 15) return 'VERIFIED';
  if (row.ocrStatus === 'PARSED_UNVERIFIED') return 'HIGH_CONFIDENCE';
  return 'PARTIAL';
}

function pct(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

export function spatialStats(dists: number[]): {
  n: number;
  medianM: number | null;
  p90M: number | null;
  p95M: number | null;
  p99M: number | null;
  maxM: number | null;
} {
  const s = [...dists].sort((a, b) => a - b);
  return {
    n: s.length,
    medianM: s.length ? s[Math.floor(s.length / 2)] : null,
    p90M: pct(s, 0.9),
    p95M: pct(s, 0.95),
    p99M: pct(s, 0.99),
    maxM: s.length ? s[s.length - 1] : null,
  };
}

export function verifyPhase3e6Preflight(repoRoot: string): {
  ok: boolean;
  errors: string[];
  inputIntegrity: 'PASS' | 'FAIL';
  movPresent: boolean;
  framesDirPresent: boolean;
  ocrRowCount: number;
} {
  const errors: string[] = [];
  const p3d = verifyPhase3dPreflight(repoRoot);
  if (!p3d.ok) errors.push(...p3d.errors);
  const fixture = loadCommittedFixture(repoRoot);
  if (fixture.positionPayloadSha256 !== POSITION_PAYLOAD_SHA256) errors.push('position hash');
  const handoff = path.join(repoRoot, HANDOFF_REL);
  if (!fs.existsSync(path.join(handoff, 'PHASE3E6_HANDOFF.md'))) errors.push('handoff md missing');
  const rows = fs.existsSync(path.join(handoff, 'iphone_gps_5s_ocr.csv')) ? loadHandoffOcrCsv(repoRoot) : [];
  if (rows.length !== 206) errors.push(`ocr rows ${rows.length}`);
  const movPresent = ['.MOV', '.mov'].some((ext) =>
    fs.readdirSync(handoff).some((f) => f.endsWith(ext)),
  );
  return {
    ok: errors.length === 0,
    errors,
    inputIntegrity: errors.length === 0 ? 'PASS' : 'FAIL',
    movPresent,
    framesDirPresent: fs.existsSync(path.join(handoff, 'frames')),
    ocrRowCount: rows.length,
  };
}

export function runPhase3e6Analysis(repoRoot: string) {
  const preflight = verifyPhase3e6Preflight(repoRoot);
  const movRows = loadHandoffOcrCsv(repoRoot);
  const frameRef = loadPhase3e4FrameReference(repoRoot);
  const fixture = loadCommittedFixture(repoRoot);
  const roads = loadRoadOutcomesByUtc(repoRoot);
  const compat = validateMovOcrRows(repoRoot); // uses 3e5 pack path — must match handoff

  const classified: ClassifiedOcrRow[] = [];
  for (let i = 0; i < movRows.length; i++) {
    const row = movRows[i]!;
    const prev = i > 0 ? movRows[i - 1]! : null;
    const conf = classifyOcrConfidence(row, frameRef);
    const independentEligible =
      conf === 'VERIFIED' || conf === 'HIGH_CONFIDENCE';
    let dimoH: number | null = null;
    let dimoBucket: string | null = null;
    if (row.lat != null && row.lon != null && row.overlayUtc) {
      const near = findNearestFixtureBucket(row.overlayUtc, fixture.buckets, 2);
      if (near?.bucket.latitude != null) {
        dimoH = haversineMeters(row.lat, row.lon, near.bucket.latitude!, near.bucket.longitude!);
        dimoBucket = near.bucket.bucketLabelUtc;
      }
    }
    let freeze = false;
    if (
      prev &&
      prev.videoNum === row.videoNum &&
      prev.lat === row.lat &&
      prev.lon === row.lon &&
      row.lat != null &&
      (prev.iphoneSpeedKmh ?? 0) !== (row.iphoneSpeedKmh ?? 0)
    ) {
      freeze = true;
    }
    let implied: number | null = null;
    if (prev && prev.videoNum === row.videoNum && prev.lat != null && row.lat != null && prev.lon != null && row.lon != null) {
      const dt = row.offsetS - prev.offsetS;
      if (dt > 0) {
        const d = haversineMeters(prev.lat, prev.lon, row.lat, row.lon);
        implied = (d / dt) * 3.6;
      }
    }
    const compatRow = compat.rows.find(
      (r) => r.videoNum === row.videoNum && r.offsetS === row.offsetS,
    );
    classified.push({
      ...row,
      ocrConfidence: conf,
      independentEligible,
      compatibilityEligible: compatRow?.verifiedForComparison ?? false,
      dimoHaversineM: dimoH,
      dimoBucketUtc: dimoBucket,
      gpsFreezeSuspected: freeze,
      impliedSpeedFromDisplacementKmh: implied,
    });
  }

  const unfilteredDists = classified
    .filter((r) => r.independentEligible && r.dimoHaversineM != null)
    .map((r) => r.dimoHaversineM!);
  const compatDists = classified
    .filter((r) => r.compatibilityEligible && r.dimoHaversineM != null)
    .map((r) => r.dimoHaversineM!);

  const freezeCases = classified.filter((r) => r.gpsFreezeSuspected);
  const disagreements: Array<{
    bucketLabelUtc: string;
    baseline: string;
    viterbi: string;
    iphoneAtUtc: boolean;
    iphoneConfidence: OcrConfidence | null;
    dimoHaversineM: number | null;
    note: string;
  }> = [];
  for (const v of compat.verified) {
    if (!v.overlayUtc || !v.baselineRoad || !v.viterbiRoad) continue;
    if (v.baselineRoad === v.viterbiRoad) continue;
    disagreements.push({
      bucketLabelUtc: v.dimoBucketUtc ?? v.overlayUtc,
      baseline: v.baselineRoad,
      viterbi: v.viterbiRoad,
      iphoneAtUtc: true,
      iphoneConfidence: classified.find((c) => c.overlayUtc === v.overlayUtc)?.ocrConfidence ?? null,
      dimoHaversineM: v.dimoHaversineM,
      note: 'iPhone overlay does not resolve road-ID ground truth; descriptive only',
    });
  }

  const p3c = runPhase3cResearch(repoRoot);
  const p3d = runPhase3dAnalysis(repoRoot);
  const baselineMae = reproduceVideoBaselineMetrics(loadVideoComparison(repoRoot)).maeKmh ?? VIDEO_BASELINE_EXPECTED.maeKmh;
  const holdout = p3c.videoValidation.independentHoldout.holdoutSubsetStats;

  const offsetSensitivity: Array<{ shiftSec: number; medianM: number | null; n: number }> = [];
  for (const shift of [-2, -1, 0, 1, 2]) {
    const ds: number[] = [];
    for (const r of classified.filter((x) => x.independentEligible && x.lat != null && x.overlayUtc)) {
      const shifted = new Date(Date.parse(r.overlayUtc!) + shift * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const near = findNearestFixtureBucket(shifted, fixture.buckets, 1);
      if (!near?.bucket.latitude) continue;
      ds.push(haversineMeters(r.lat!, r.lon!, near.bucket.latitude!, near.bucket.longitude!));
    }
    offsetSensitivity.push({ shiftSec: shift, medianM: spatialStats(ds).medianM, n: ds.length });
  }

  return {
    preflight,
    classified,
    spatialA: spatialStats(unfilteredDists),
    spatialB: spatialStats(compatDists),
    compatVerifiedCount: compat.stats.verifiedCount,
    freezeCases,
    disagreements,
    offsetSensitivity,
    p3c,
    p3d,
    baselineMae,
    holdoutMae: holdout.maeKmh,
    bestValidatedAlgo: p3c.bestValidatedCandidate,
    speedImprovementProven: 'NO' as const,
    roads,
  };
}
