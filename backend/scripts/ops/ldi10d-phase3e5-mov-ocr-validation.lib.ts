/**
 * LDI-10D Phase 3E.5 — ChatGPT MOV OCR pack validation (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import { loadCommittedFixture } from './ldi10d-phase3c2-tesla-gps-fixture.lib';
import { POSITION_PAYLOAD_SHA256 } from './ldi10d-phase3c1-tesla-gps-comparative-replay.lib';
import { verifyPhase3dPreflight } from './ldi10d-phase3d-gps-evidence-quality.lib';
import {
  findNearestFixtureBucket,
  SPATIAL_OUTLIER_THRESHOLD_M,
  TESLA_TRIP_LAT_MAX,
  TESLA_TRIP_LAT_MIN,
} from './ldi10d-phase3e4-iphone-gps-forensics.lib';
import { normalizeOutcome } from './ldi10d-phase3e3-road-matching-accuracy.lib';
import {
  BASELINE_AMBIGUOUS,
  BASELINE_ASSOCIATED,
  BASELINE_UNKNOWN,
} from './ldi10d-phase3e3-road-matching-accuracy.lib';

export const PACK_REL = 'architecture/drivingintelligence/evidence/ldi-10d/phase3e5-research-pack';
export const LON_MIN = 9.42;
export const LON_MAX = 9.52;
export const DIMO_CORROBORATION_MAX_M = 35;
export const MAX_JUMP_M_PER_5S_AT_130KMH = 200;

const VIDEO_BY_NUM: Record<string, string> = {
  '62': 'TC_00062.MOV',
  '63': 'TC_00063.MOV',
  '64': 'TC_00064.MOV',
  '65': 'TC_00065.MOV',
  '66': 'TC_00066.MOV',
  '67': 'TC_00067.MOV',
};

export type MovOcrRow = {
  video: string;
  videoNum: string;
  frameFile: string;
  offsetS: number;
  overlayUtc: string | null;
  lat: number | null;
  lon: number | null;
  iphoneSpeedKmh: number | null;
  ocrStatus: string;
  rawOcr: string;
};

export type VerificationLabel =
  | 'VERIFIED_FRAME_CROSSCHECK'
  | 'VERIFIED_DIMO_CORROBORATED'
  | 'REJECTED_PARTIAL_OCR'
  | 'REJECTED_MISSING_COORDS'
  | 'REJECTED_CORRIDOR'
  | 'REJECTED_LON_BAND'
  | 'REJECTED_RAW_COORD_PATTERN'
  | 'REJECTED_DIMO_DISAGREEMENT'
  | 'REJECTED_POSITION_JUMP'
  | 'REJECTED_TIMESTAMP'
  | 'UNVERIFIED_PARSED';

export type ValidatedRow = MovOcrRow & {
  verification: VerificationLabel;
  verifiedForComparison: boolean;
  dimoHaversineM: number | null;
  dimoBucketUtc: string | null;
  frameCrosscheckM: number | null;
  gpsFreezeCandidate: boolean;
  positionJumpM: number | null;
  baselineRoad: string | null;
  viterbiRoad: string | null;
  issues: string[];
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

export function loadMovOcrCsv(repoRoot: string): MovOcrRow[] {
  const p = path.join(repoRoot, PACK_REL, 'iphone_gps_5s_ocr.csv');
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
  const out: MovOcrRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const videoNum = cols[0] ?? '';
    const frameFile = cols[1] ?? '';
    const offsetS = parseInt(cols[2] ?? '', 10);
    const overlayUtc = cols[3]?.trim() || null;
    const lat = cols[4]?.trim() ? parseFloat(cols[4]) : null;
    const lon = cols[5]?.trim() ? parseFloat(cols[5]) : null;
    const speed = cols[6]?.trim() ? parseFloat(cols[6]) : null;
    const ocrStatus = cols[7] ?? '';
    const rawOcr = cols[8] ?? '';
    out.push({
      video: VIDEO_BY_NUM[videoNum] ?? `TC_${videoNum}.MOV`,
      videoNum,
      frameFile,
      offsetS,
      overlayUtc: overlayUtc || null,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      iphoneSpeedKmh: Number.isFinite(speed) ? speed : null,
      ocrStatus,
      rawOcr,
    });
  }
  return out;
}

export function rawHasExplicitCoord(raw: string): boolean {
  return /\+51\.\d{4,6}\s*,\s*\+9\.\d{4,6}/.test(raw) || /\+51\.\d{4,6},\+9\.\d{4,6}/.test(raw);
}

export function loadPhase3e4FrameReference(repoRoot: string): Map<string, { lat: number; lon: number }> {
  const p = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3E4_IPHONE_GPS_OBSERVATIONS.json',
  );
  const doc = JSON.parse(fs.readFileSync(p, 'utf8')) as {
    observations: Array<{ video: string; videoOffsetSec: number; latitude: number | null; longitude: number | null }>;
  };
  const m = new Map<string, { lat: number; lon: number }>();
  for (const o of doc.observations) {
    if (o.latitude == null || o.longitude == null) continue;
    m.set(`${o.video}:${o.videoOffsetSec}`, { lat: o.latitude, lon: o.longitude });
  }
  return m;
}

export function loadRoadOutcomesByUtc(repoRoot: string): Map<string, { baseline: string; viterbi: string }> {
  const p = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3E2_PER_SECOND_SPATIAL.json',
  );
  const doc = JSON.parse(fs.readFileSync(p, 'utf8')) as {
    buckets: Array<{ bucketLabelUtc: string; baselineOutcome: string; candidateOutcome: string }>;
  };
  const m = new Map<string, { baseline: string; viterbi: string }>();
  for (const b of doc.buckets) {
    m.set(b.bucketLabelUtc, {
      baseline: normalizeOutcome(b.baselineOutcome),
      viterbi: normalizeOutcome(b.candidateOutcome),
    });
  }
  return m;
}

export function verifyPhase3e5Preflight(repoRoot: string): {
  ok: boolean;
  errors: string[];
  rowCount: number;
  framesSamplePresent: boolean;
} {
  const errors: string[] = [];
  const p3d = verifyPhase3dPreflight(repoRoot);
  if (!p3d.ok) errors.push(...p3d.errors);
  const fixture = loadCommittedFixture(repoRoot);
  if (fixture.positionPayloadSha256 !== POSITION_PAYLOAD_SHA256) errors.push('position hash');
  const pack = path.join(repoRoot, PACK_REL);
  if (!fs.existsSync(path.join(pack, 'iphone_gps_5s_ocr.csv'))) errors.push('iphone_gps_5s_ocr.csv missing');
  const rows = fs.existsSync(path.join(pack, 'iphone_gps_5s_ocr.csv')) ? loadMovOcrCsv(repoRoot) : [];
  if (rows.length !== 206) errors.push(`expected 206 rows got ${rows.length}`);
  const framesDir = path.join(pack, 'frames_sample');
  return {
    ok: errors.length === 0,
    errors,
    rowCount: rows.length,
    framesSamplePresent: fs.existsSync(framesDir),
  };
}

export function validateMovOcrRows(repoRoot: string): {
  rows: ValidatedRow[];
  verified: ValidatedRow[];
  stats: {
    total: number;
    verifiedCount: number;
    freezeCandidates: number;
    jumpRejections: number;
    dimoRejections: number;
    partialCount: number;
  };
  spatial: {
    medianM: number | null;
    p90M: number | null;
    p95M: number | null;
    robustCount: number;
  };
  roadAtVerified: {
    baseline: Record<string, number>;
    viterbi: Record<string, number>;
    disagreementBuckets: number;
  };
  stopCandidates: Array<{
    startUtc: string;
    endUtc: string;
    label: 'INFERRED_CANDIDATE';
    reason: string;
  }>;
} {
  const movRows = loadMovOcrCsv(repoRoot);
  const frameRef = loadPhase3e4FrameReference(repoRoot);
  const fixture = loadCommittedFixture(repoRoot);
  const roads = loadRoadOutcomesByUtc(repoRoot);

  const validated: ValidatedRow[] = [];
  let lastVerified: { lat: number; lon: number; offsetS: number; videoNum: string } | null = null;

  for (let ri = 0; ri < movRows.length; ri++) {
    const r = movRows[ri]!;
    const prev = ri > 0 ? movRows[ri - 1]! : null;
    const issues: string[] = [];
    let verification: VerificationLabel = 'UNVERIFIED_PARSED';
    let verifiedForComparison = false;
    let dimoH: number | null = null;
    let dimoBucket: string | null = null;
    let frameCross: number | null = null;
    let jumpM: number | null = null;
    let freeze = false;

    if (r.ocrStatus === 'PARTIAL_REVIEW_REQUIRED') {
      verification = 'REJECTED_PARTIAL_OCR';
    } else if (r.lat == null || r.lon == null) {
      verification = 'REJECTED_MISSING_COORDS';
    } else if (r.lat < TESLA_TRIP_LAT_MIN || r.lat > TESLA_TRIP_LAT_MAX) {
      verification = 'REJECTED_CORRIDOR';
      issues.push('lat_corridor');
    } else if (r.lon < LON_MIN || r.lon > LON_MAX) {
      verification = 'REJECTED_LON_BAND';
      issues.push('lon_band');
    } else if (!rawHasExplicitCoord(r.rawOcr)) {
      verification = 'REJECTED_RAW_COORD_PATTERN';
      issues.push('no_plus51_in_raw');
    } else if (!r.overlayUtc) {
      verification = 'REJECTED_TIMESTAMP';
    } else {
      const near = findNearestFixtureBucket(r.overlayUtc, fixture.buckets, 2);
      if (!near || near.bucket.latitude == null || near.bucket.longitude == null) {
        verification = 'REJECTED_DIMO_DISAGREEMENT';
        issues.push('no_dimo_bucket');
      } else {
        dimoH = haversineMeters(r.lat, r.lon, near.bucket.latitude!, near.bucket.longitude!);
        dimoBucket = near.bucket.bucketLabelUtc;
        if (dimoH > DIMO_CORROBORATION_MAX_M) {
          verification = 'REJECTED_DIMO_DISAGREEMENT';
          issues.push(`dimo_${dimoH.toFixed(1)}m`);
        } else {
          const refKey = `${r.video}:${r.offsetS}`;
          const ref = frameRef.get(refKey);
          if (ref) {
            frameCross = haversineMeters(r.lat, r.lon, ref.lat, ref.lon);
            if (frameCross <= 15) {
              verification = 'VERIFIED_FRAME_CROSSCHECK';
              verifiedForComparison = true;
            }
          }
          if (!verifiedForComparison) {
            verification = 'VERIFIED_DIMO_CORROBORATED';
            verifiedForComparison = true;
          }
          if (lastVerified && lastVerified.videoNum === r.videoNum) {
            jumpM = haversineMeters(r.lat, r.lon, lastVerified.lat, lastVerified.lon);
            const maxJump = (MAX_JUMP_M_PER_5S_AT_130KMH * (r.offsetS - lastVerified.offsetS)) / 5;
            if (jumpM > maxJump + 25) {
              verification = 'REJECTED_POSITION_JUMP';
              verifiedForComparison = false;
              issues.push(`jump_${jumpM.toFixed(0)}m`);
            }
          }
          if (verifiedForComparison) {
            lastVerified = { lat: r.lat, lon: r.lon, offsetS: r.offsetS, videoNum: r.videoNum };
          }
        }
      }
    }

    if (
      prev &&
      prev.videoNum === r.videoNum &&
      prev.lat === r.lat &&
      prev.lon === r.lon &&
      r.lat != null &&
      (prev.iphoneSpeedKmh ?? 0) !== (r.iphoneSpeedKmh ?? 0)
    ) {
      freeze = true;
    }

    const road = r.overlayUtc ? roads.get(r.overlayUtc) : undefined;
    validated.push({
      ...r,
      verification,
      verifiedForComparison,
      dimoHaversineM: dimoH,
      dimoBucketUtc: dimoBucket,
      frameCrosscheckM: frameCross,
      gpsFreezeCandidate: freeze,
      positionJumpM: jumpM,
      baselineRoad: road?.baseline ?? null,
      viterbiRoad: road?.viterbi ?? null,
      issues,
    });
  }

  const verified = validated.filter((v) => v.verifiedForComparison);
  const dists = verified
    .map((v) => v.dimoHaversineM!)
    .filter((d) => d <= SPATIAL_OUTLIER_THRESHOLD_M)
    .sort((a, b) => a - b);
  const pct = (p: number) =>
    dists.length ? dists[Math.min(dists.length - 1, Math.floor(p * dists.length))] : null;

  const baselineCounts: Record<string, number> = { ASSOCIATED: 0, AMBIGUOUS: 0, UNKNOWN: 0 };
  const viterbiCounts: Record<string, number> = { ASSOCIATED: 0, AMBIGUOUS: 0, UNKNOWN: 0 };
  let disagree = 0;
  for (const v of verified) {
    if (v.baselineRoad) baselineCounts[v.baselineRoad] = (baselineCounts[v.baselineRoad] ?? 0) + 1;
    if (v.viterbiRoad) viterbiCounts[v.viterbiRoad] = (viterbiCounts[v.viterbiRoad] ?? 0) + 1;
    if (v.baselineRoad && v.viterbiRoad && v.baselineRoad !== v.viterbiRoad) disagree++;
  }

  const stops: Array<{ startUtc: string; endUtc: string; label: 'INFERRED_CANDIDATE'; reason: string }> = [];
  for (let i = 0; i < verified.length; i++) {
    const v = verified[i]!;
    if ((v.iphoneSpeedKmh ?? 99) >= 2) continue;
    const sameVideo = verified.filter(
      (x) => x.videoNum === v.videoNum && (x.iphoneSpeedKmh ?? 99) < 2 && x.overlayUtc,
    );
    if (sameVideo.length >= 2) {
      const u = sameVideo.map((s) => s.overlayUtc!).sort();
      stops.push({
        startUtc: u[0]!,
        endUtc: u[u.length - 1]!,
        label: 'INFERRED_CANDIDATE',
        reason: 'consecutive_low_iphone_overlay_speed_same_video',
      });
    }
  }

  return {
    rows: validated,
    verified,
    stats: {
      total: validated.length,
      verifiedCount: verified.length,
      freezeCandidates: validated.filter((v) => v.gpsFreezeCandidate).length,
      jumpRejections: validated.filter((v) => v.verification === 'REJECTED_POSITION_JUMP').length,
      dimoRejections: validated.filter((v) => v.verification === 'REJECTED_DIMO_DISAGREEMENT').length,
      partialCount: validated.filter((v) => v.ocrStatus === 'PARTIAL_REVIEW_REQUIRED').length,
    },
    spatial: {
      medianM: dists.length ? dists[Math.floor(dists.length / 2)] : null,
      p90M: pct(0.9),
      p95M: pct(0.95),
      robustCount: dists.length,
    },
    roadAtVerified: { baseline: baselineCounts, viterbi: viterbiCounts, disagreementBuckets: disagree },
    stopCandidates: stops.slice(0, 20),
  };
}

export function runPhase3e5Analysis(repoRoot: string) {
  const preflight = verifyPhase3e5Preflight(repoRoot);
  const validation = validateMovOcrRows(repoRoot);
  return { preflight, validation };
}

export {
  BASELINE_ASSOCIATED,
  BASELINE_AMBIGUOUS,
  BASELINE_UNKNOWN,
};
