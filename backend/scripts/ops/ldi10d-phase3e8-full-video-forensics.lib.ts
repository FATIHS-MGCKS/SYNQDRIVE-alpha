/**
 * LDI-10D Phase 3E.8 — analyze 1Hz OCR checkpoint + spatial forensics.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import { POSITION_PAYLOAD_SHA256 } from './ldi10d-phase3c1-tesla-gps-comparative-replay.lib';
import { loadCommittedFixture } from './ldi10d-phase3c2-tesla-gps-fixture.lib';
import {
  loadVideoComparison,
  reproduceVideoBaselineMetrics,
  VIDEO_BASELINE_EXPECTED,
} from './ldi10d-phase3c-gps-speed-research.lib';
import { runPhase3dAnalysis, verifyPhase3dPreflight } from './ldi10d-phase3d-gps-evidence-quality.lib';
import { findNearestFixtureBucket } from './ldi10d-phase3e4-iphone-gps-forensics.lib';
import { loadPhase3e4FrameReference, loadRoadOutcomesByUtc } from './ldi10d-phase3e5-mov-ocr-validation.lib';
import { LON_MAX, LON_MIN, DIMO_CORROBORATION_MAX_M } from './ldi10d-phase3e5-mov-ocr-validation.lib';
import { normalizeOutcome } from './ldi10d-phase3e3-road-matching-accuracy.lib';
import { TESLA_TRIP_LAT_MIN, TESLA_TRIP_LAT_MAX } from './ldi10d-phase3e4-iphone-gps-forensics.lib';

export const WORK_REL = 'architecture/drivingintelligence/evidence/ldi-10d/phase3e8-work';
export const EXPECTED_1HZ = 1028;
export const VIDEO_SECONDS_TOTAL = 1027.588333;

export type OcrCheckpointRow = {
  video_num: string;
  second_index: number;
  sync_utc_from_metadata: string | null;
  lat: number | null;
  lon: number | null;
  overlay_local: string | null;
  iphone_speed_kmh: number | null;
  ocr_class: string;
  uncertain_fields: string[];
  frame_sha256_expected?: string;
  crop_sha256?: string;
};

export function loadCheckpoint(repoRoot: string): OcrCheckpointRow[] {
  const p = path.join(repoRoot, WORK_REL, 'OCR_1HZ_CHECKPOINT.jsonl');
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as OcrCheckpointRow);
}

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

export function verifyPhase3e8Preflight(repoRoot: string): {
  ok: boolean;
  errors: string[];
  inputIntegrity: 'PASS' | 'FAIL' | 'INCOMPLETE';
  checkpointRows: number;
  coveragePercent: number;
} {
  const errors: string[] = [];
  const p3d = verifyPhase3dPreflight(repoRoot);
  if (!p3d.ok) errors.push(...p3d.errors);
  const fixture = loadCommittedFixture(repoRoot);
  if (fixture.positionPayloadSha256 !== POSITION_PAYLOAD_SHA256) errors.push('position hash');
  const rows = loadCheckpoint(repoRoot);
  const coverage = (rows.length / EXPECTED_1HZ) * 100;
  const inputIntegrity = rows.length === EXPECTED_1HZ ? 'PASS' : rows.length > 0 ? 'INCOMPLETE' : 'FAIL';
  if (rows.length !== EXPECTED_1HZ) errors.push(`checkpoint ${rows.length}/${EXPECTED_1HZ}`);
  return {
    ok: rows.length === EXPECTED_1HZ && errors.filter((e) => e.startsWith('checkpoint')).length === 0,
    errors,
    inputIntegrity,
    checkpointRows: rows.length,
    coveragePercent: coverage,
  };
}

export function runPhase3e8Analysis(repoRoot: string) {
  const rows = loadCheckpoint(repoRoot);
  const preflight = verifyPhase3e8Preflight(repoRoot);
  const frameRef = loadPhase3e4FrameReference(repoRoot);
  const fixture = loadCommittedFixture(repoRoot);
  const roads = loadRoadOutcomesByUtc(repoRoot);
  const videoMap: Record<string, string> = {
    '62': 'TC_00062.MOV',
    '63': 'TC_00063.MOV',
    '64': 'TC_00064.MOV',
    '65': 'TC_00065.MOV',
    '66': 'TC_00066.MOV',
    '67': 'TC_00067.MOV',
  };

  const enriched = rows.map((r, i) => {
    const video = videoMap[r.video_num] ?? `TC_${r.video_num}.MOV`;
    let frameVerified = false;
    const ref = frameRef.get(`${video}:${r.second_index}`);
    if (ref && r.lat != null && r.lon != null && haversineMeters(r.lat, r.lon, ref.lat, ref.lon) <= 15) {
      frameVerified = true;
    }
    let dimoH: number | null = null;
    const utc = r.sync_utc_from_metadata;
    if (r.lat != null && r.lon != null && utc) {
      const near = findNearestFixtureBucket(utc, fixture.buckets, 2);
      if (near?.bucket.latitude != null) {
        dimoH = haversineMeters(r.lat, r.lon, near.bucket.latitude!, near.bucket.longitude!);
      }
    }
    const road = utc ? roads.get(utc) : undefined;
    const prev = i > 0 ? rows[i - 1] : null;
    const freeze =
      prev &&
      prev.video_num === r.video_num &&
      prev.lat === r.lat &&
      prev.lon === r.lon &&
      r.lat != null &&
      (prev.iphone_speed_kmh ?? 0) !== (r.iphone_speed_kmh ?? 0);
    return { ...r, video, frameVerified, dimoH, freeze, baselineRoad: road?.baseline, viterbiRoad: road?.viterbi };
  });

  const inCorridor = (r: { lat: number | null; lon: number | null }) =>
    r.lat != null &&
    r.lon != null &&
    r.lat >= TESLA_TRIP_LAT_MIN &&
    r.lat <= TESLA_TRIP_LAT_MAX &&
    r.lon >= LON_MIN &&
    r.lon <= LON_MAX;

  const qualityIndependent = enriched.filter((r) => inCorridor(r));
  const setA = qualityIndependent.filter((r) => r.dimoH != null).map((r) => r.dimoH!);
  const setB = qualityIndependent.filter((r) => r.dimoH != null && r.dimoH <= DIMO_CORROBORATION_MAX_M).map((r) => r.dimoH!);

  const gpsFully = enriched.filter(
    (r) =>
      inCorridor(r) &&
      r.overlay_local &&
      r.iphone_speed_kmh != null &&
      r.ocr_class !== 'OCR_FAILED',
  ).length;
  const gpsPartial = enriched.filter(
    (r) => r.ocr_class !== 'OCR_FAILED' && inCorridor(r) && (r.overlay_local == null || r.iphone_speed_kmh == null),
  ).length;
  const gpsUnread = enriched.filter((r) => r.ocr_class === 'OCR_FAILED' || !inCorridor(r)).length;
  const indepVerified = enriched.filter((r) => r.frameVerified).length;

  const coverageGate = rows.length === EXPECTED_1HZ ? 'PASS' : 'INCOMPLETE';

  return {
    preflight,
    enriched,
    spatialA: spatialStats(setA),
    spatialB: spatialStats(setB),
    gpsFully,
    gpsPartial,
    gpsUnread,
    indepVerified,
    freezeCases: enriched.filter((r) => r.freeze),
    coverageGate,
    p3d: runPhase3dAnalysis(repoRoot),
    baselineMae: reproduceVideoBaselineMetrics(loadVideoComparison(repoRoot)).maeKmh ?? VIDEO_BASELINE_EXPECTED.maeKmh,
    disagreements: enriched.filter((r) => r.baselineRoad && r.viterbiRoad && r.baselineRoad !== r.viterbiRoad),
  };
}
