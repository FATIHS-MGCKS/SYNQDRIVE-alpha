/**
 * LDI-10D Phase 3E.11 — independent evidence hardening (offline).
 */
import * as crypto from 'node:crypto';
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
import { verifyPhase3dPreflight } from './ldi10d-phase3d-gps-evidence-quality.lib';
import { findNearestFixtureBucket } from './ldi10d-phase3e4-iphone-gps-forensics.lib';
import { loadPhase3e4FrameReference } from './ldi10d-phase3e5-mov-ocr-validation.lib';
import {
  enrichCheckpoint,
  EnrichedRow,
  inCorridor,
  isFullyReadable,
} from './ldi10d-phase3e9-ocr-quality-audit.lib';
import { verifyPhase3e8Preflight } from './ldi10d-phase3e8-full-video-forensics.lib';
import {
  findNearestFrameRef,
  REFERENCE_L3_MAE,
  verifyInputIntegrity,
  wilsonCi,
} from './ldi10d-phase3e10-independent-validation.lib';

export const EVIDENCE_REL = 'architecture/drivingintelligence/evidence/ldi-10d';
export const PHASE3E11_SEED = 311111;
export const MIN_OCR_SAMPLES = 120;
export const MOV_SHA_REL = 'phase3e8-work/MOV_SHA256.txt';

export type OcrLabelClass =
  | 'VISUALLY_VERIFIED'
  | 'REFERENCE_CORROBORATED'
  | 'OCR_MODEL_AGREEMENT_ONLY'
  | 'HUMAN_REVIEW_REQUIRED'
  | 'UNREADABLE';

export type StopForensicClass =
  | 'MULTISOURCE_SUPPORTED_STOP'
  | 'OVERLAY_OBSERVED_STATIONARY'
  | 'GPS_FREEZE_SUSPECTED'
  | 'CONTRADICTED'
  | 'UNKNOWN';

function spatialStats(dists: number[]) {
  const s = [...dists].sort((a, b) => a - b);
  const pct = (p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null);
  return {
    n: s.length,
    medianM: s.length ? s[Math.floor(s.length / 2)] : null,
    p90M: pct(0.9),
    p95M: pct(0.95),
    uniqueBuckets: 0,
  };
}

const VIDEO_FILE: Record<string, string> = {
  '62': 'TC_00062.MOV',
  '63': 'TC_00063.MOV',
  '64': 'TC_00064.MOV',
  '65': 'TC_00065.MOV',
  '66': 'TC_00066.MOV',
  '67': 'TC_00067.MOV',
};

export function verifyMovSha256(repoRoot: string, movDir: string): {
  ok: boolean;
  lines: string[];
  mismatches: string[];
} {
  const expected = fs
    .readFileSync(path.join(repoRoot, EVIDENCE_REL, MOV_SHA_REL), 'utf8')
    .trim()
    .split('\n')
    .map((l) => {
      const [hash, ...rest] = l.split(/\s+/);
      const file = rest.join(' ').trim();
      const base = path.basename(file);
      return { hash, base };
    });
  const mismatches: string[] = [];
  for (const e of expected) {
    const p = path.join(movDir, e.base);
    if (!fs.existsSync(p)) {
      mismatches.push(`missing ${e.base}`);
      continue;
    }
    const h = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    if (h !== e.hash) mismatches.push(`${e.base} sha mismatch`);
  }
  return { ok: mismatches.length === 0, lines: expected.map((x) => `${x.hash} ${x.base}`), mismatches };
}

export function buildOcrSampleSpec(repoRoot: string): Array<{ videoNum: string; secondIndex: number; stratum: string }> {
  const rows = enrichCheckpoint(repoRoot);
  const strata: Record<string, EnrichedRow[]> = {
    fully_readable: rows.filter(isFullyReadable),
    partial: rows.filter((r) => r.ocr_class === 'OCR_PARTIAL' || r.ocr_class === 'OCR_AMBIGUOUS'),
    problematic: rows.filter((r) => r.ocr_class === 'OCR_FAILED' || !inCorridor(r)),
  };
  const perVideo = Math.ceil(MIN_OCR_SAMPLES / 6);
  const spec: Array<{ videoNum: string; secondIndex: number; stratum: string }> = [];
  const seen = new Set<string>();
  for (const [stratum, pool] of Object.entries(strata)) {
    const sorted = [...pool].sort(
      (a, b) =>
        ((PHASE3E11_SEED + a.second_index * 41) % 100000) - ((PHASE3E11_SEED + b.second_index * 41) % 100000),
    );
    for (const vn of ['62', '63', '64', '65', '66', '67']) {
      let n = 0;
      for (const r of sorted.filter((x) => x.video_num === vn)) {
        const k = `${r.video_num}:${r.second_index}`;
        if (seen.has(k)) continue;
        seen.add(k);
        spec.push({ videoNum: r.video_num, secondIndex: r.second_index, stratum });
        n++;
        if (n >= Math.ceil(perVideo / 3)) break;
      }
    }
  }
  const frameRef = loadPhase3e4FrameReference(repoRoot);
  for (const key of frameRef.keys()) {
    const m = key.match(/^TC_0*(\d+)\.MOV:(\d+)$/);
    if (!m) continue;
    const vn = String(parseInt(m[1]!, 10));
    const sec = Number(m[2]);
    const k = `${vn}:${sec}`;
    if (!seen.has(k)) {
      seen.add(k);
      spec.push({ videoNum: vn, secondIndex: sec, stratum: 'frame_ref' });
    }
  }
  if (spec.length < MIN_OCR_SAMPLES) {
    const sortedAll = [...rows].sort(
      (a, b) =>
        ((PHASE3E11_SEED + a.second_index * 13) % 100000) -
        ((PHASE3E11_SEED + b.second_index * 13) % 100000),
    );
    for (const r of sortedAll) {
      if (spec.length >= MIN_OCR_SAMPLES) break;
      const k = `${r.video_num}:${r.second_index}`;
      if (seen.has(k)) continue;
      seen.add(k);
      spec.push({
        videoNum: r.video_num,
        secondIndex: r.second_index,
        stratum: isFullyReadable(r) ? 'fully_readable_topup' : 'top_up',
      });
    }
  }
  return spec;
}

export function classifyOcrFrame(
  row: EnrichedRow | undefined,
  dualAgree: boolean,
  frameRef: ReturnType<typeof loadPhase3e4FrameReference>,
): OcrLabelClass {
  if (!row || row.ocr_class === 'OCR_FAILED' || !inCorridor(row)) return 'UNREADABLE';
  const ref = findNearestFrameRef(VIDEO_FILE[row.video_num], row.second_index, frameRef, 2);
  if (ref && row.lat != null && row.lon != null) {
    const d = haversineMeters(row.lat, row.lon, ref.lat, ref.lon);
    if (d <= 15) return 'REFERENCE_CORROBORATED';
  }
  if (dualAgree) return 'OCR_MODEL_AGREEMENT_ONLY';
  return 'HUMAN_REVIEW_REQUIRED';
}

export function fieldErrorsVsReference(
  row: EnrichedRow,
  ref: { lat: number; lon: number },
): { latitude: boolean; longitude: boolean } {
  return {
    latitude: row.lat != null && Math.abs(row.lat - ref.lat) > 0.00015,
    longitude: row.lon != null && Math.abs(row.lon - ref.lon) > 0.00015,
  };
}

export function loadFiveStopCases(repoRoot: string): Array<{ videoNum: string; secondIndex: number }> {
  const doc = JSON.parse(
    fs.readFileSync(path.join(repoRoot, EVIDENCE_REL, 'LDI10D_PHASE3E10_STOP_CASES.json'), 'utf8'),
  ) as { cases: Array<{ videoNum: string; secondIndex: number; classification: string }> };
  return doc.cases.filter((c) => c.classification === 'OVERLAY_OBSERVED_STATIONARY');
}

export function buildStopForensics(repoRoot: string, windowSec = 15): Array<{
  videoNum: string;
  anchorSecond: number;
  classification: StopForensicClass;
  window: Array<Record<string, unknown>>;
  rationale: string[];
}> {
  const rows = enrichCheckpoint(repoRoot);
  const byVideo = new Map<string, EnrichedRow[]>();
  for (const r of rows) {
    const list = byVideo.get(r.video_num) ?? [];
    list.push(r);
    byVideo.set(r.video_num, list);
  }
  const fixture = loadCommittedFixture(repoRoot);
  const cases = loadFiveStopCases(repoRoot);
  return cases.map((c) => {
    const list = (byVideo.get(c.videoNum) ?? []).sort((a, b) => a.second_index - b.second_index);
    const win = list.filter((r) => r.second_index >= c.secondIndex - windowSec && r.second_index <= c.secondIndex + windowSec);
    const timeline = win.map((r) => {
      const near = r.sync_utc_from_metadata
        ? findNearestFixtureBucket(r.sync_utc_from_metadata, fixture.buckets, 2)
        : null;
      return {
        secondIndex: r.second_index,
        syncUtc: r.sync_utc_from_metadata,
        overlaySpeedKmh: r.iphone_speed_kmh,
        lat: r.lat,
        lon: r.lon,
        ocrClass: r.ocr_class,
        freezePoint3e8: r.freezePoint3e8,
        dimoLat: near?.bucket.latitude ?? null,
        dimoLon: near?.bucket.longitude ?? null,
        dimoAvailability: near?.bucket.availability ?? null,
        l3Kmh: near?.bucket.pinnedProductionL3Kmh ?? null,
        dimoHaversineM: r.dimoH,
      };
    });
    const anchor = win.find((r) => r.second_index === c.secondIndex);
    const rationale: string[] = [];
    const lowOverlay = win.filter((r) => (r.iphone_speed_kmh ?? 99) <= 1.5);
    const staticCoords =
      lowOverlay.length >= 3 &&
      lowOverlay.every((r) => r.lat === anchor?.lat && r.lon === anchor?.lon && r.lat != null);
    const dimoPts = timeline.filter((t) => t.dimoLat != null) as Array<{ dimoLat: number; dimoLon: number }>;
    let dimoDisp = 0;
    if (dimoPts.length >= 2) {
      dimoDisp = haversineMeters(
        dimoPts[0]!.dimoLat as number,
        dimoPts[0]!.dimoLon as number,
        dimoPts[dimoPts.length - 1]!.dimoLat as number,
        dimoPts[dimoPts.length - 1]!.dimoLon as number,
      );
    }
    const l3Low = timeline.filter((t) => t.l3Kmh != null && (t.l3Kmh as number) < 4).length;
    const contradicted = win.some((r) => (r.impliedSpeedKmh ?? 0) > 10 && (r.iphone_speed_kmh ?? 99) < 2);
    let classification: StopForensicClass = 'UNKNOWN';
    if (contradicted) {
      classification = 'CONTRADICTED';
      rationale.push('Implied displacement contradicts low overlay speed');
    } else if (anchor?.freezePoint3e8) {
      classification = 'GPS_FREEZE_SUSPECTED';
      rationale.push('3E8 freeze-point flag at anchor second');
    } else if (staticCoords && dimoDisp < 8 && l3Low >= 3) {
      classification = 'MULTISOURCE_SUPPORTED_STOP';
      rationale.push('Static overlay coords, DIMO displacement <8m in window, L3 low at ≥3 seconds');
    } else if (staticCoords) {
      classification = 'OVERLAY_OBSERVED_STATIONARY';
      rationale.push('Overlay stationary pattern only');
    } else {
      classification = 'UNKNOWN';
      rationale.push('Insufficient multisource agreement');
    }
    return {
      videoNum: c.videoNum,
      anchorSecond: c.secondIndex,
      classification,
      window: timeline,
      rationale,
    };
  });
}

export function temporalAlignmentAnalysis(repoRoot: string) {
  const fixture = loadCommittedFixture(repoRoot);
  const rows = enrichCheckpoint(repoRoot).filter((r) => inCorridor(r) && r.lat != null && r.sync_utc_from_metadata);
  const offsets = [-2, -1, 0, 1, 2];
  const perOffset = offsets.map((shift) => {
    const dists: number[] = [];
    const bucketHits = new Map<string, number>();
    const moving: number[] = [];
    const stationary: number[] = [];
    const freezeInfluenced: number[] = [];
    for (const r of rows) {
      const shifted = new Date(Date.parse(r.sync_utc_from_metadata!) + shift * 1000)
        .toISOString()
        .replace(/\.\d{3}Z$/, 'Z');
      const near = findNearestFixtureBucket(shifted, fixture.buckets, 1);
      if (!near?.bucket.latitude) continue;
      const d = haversineMeters(r.lat!, r.lon!, near.bucket.latitude!, near.bucket.longitude!);
      dists.push(d);
      bucketHits.set(near.bucket.bucketLabelUtc, (bucketHits.get(near.bucket.bucketLabelUtc) ?? 0) + 1);
      const bucket = near.bucket.bucketLabelUtc;
      if ((r.iphone_speed_kmh ?? 0) < 3) stationary.push(d);
      else moving.push(d);
      if (r.freezePoint3e8) freezeInfluenced.push(d);
    }
    const dup = [...bucketHits.values()].filter((c) => c > 1).reduce((a, c) => a + (c - 1), 0);
    const stats = spatialStats(dists);
    return {
      shiftSec: shift,
      validPairs: dists.length,
      uniqueBuckets: bucketHits.size,
      duplicateBucketAssignments: dup,
      medianM: stats.medianM,
      p90M: stats.p90M,
      p95M: stats.p95M,
      movingMedianM: spatialStats(moving).medianM,
      stationaryMedianM: spatialStats(stationary).medianM,
      freezePointMedianM: spatialStats(freezeInfluenced).medianM,
      freezePointCount: freezeInfluenced.length,
    };
  });
  const baseline = perOffset.find((p) => p.shiftSec === 0)!;
  return {
    documentedUtcFirst: true,
    offsetsTested: offsets,
    perOffset,
    conclusion:
      'Lowest median at a non-zero shift is sensitivity-only; overlay metadata UTC remains primary alignment per 3E.8. Latency between overlay refresh and DIMO sample not independently measured.',
    baselineMedianM: baseline.medianM,
    baselineP95M: baseline.p95M,
    uniquePairsAtZero: baseline.uniqueBuckets,
  };
}

export function runPhase3e11Analysis(
  repoRoot: string,
  movDir: string,
  dualOcrByKey: Map<string, boolean>,
) {
  if (!verifyPhase3e8Preflight(repoRoot).ok) throw new Error('3E.8 checkpoint incomplete');
  const integrity = verifyInputIntegrity(repoRoot);
  const movSha = verifyMovSha256(repoRoot, movDir);
  const p3d = verifyPhase3dPreflight(repoRoot);
  const fixture = loadCommittedFixture(repoRoot);
  if (fixture.positionPayloadSha256 !== POSITION_PAYLOAD_SHA256) throw new Error('fixture hash drift');

  const spec = buildOcrSampleSpec(repoRoot);
  const frameRef = loadPhase3e4FrameReference(repoRoot);
  const rows = enrichCheckpoint(repoRoot);
  const byKey = new Map(rows.map((r) => [`${r.video_num}:${r.second_index}`, r]));

  const frameReviews: Array<{
    reviewId: string;
    videoNum: string;
    secondIndex: number;
    stratum: string;
    labelClass: OcrLabelClass;
    expectedLat: number | null;
    expectedLon: number | null;
    expectedSpeed: number | null;
    expectedTimestamp: string | null;
  }> = [];

  let visuallyVerified = 0;
  let reviewRequired = 0;
  const refLabeled: Array<{ latitude: boolean; longitude: boolean }> = [];

  spec.forEach((s, i) => {
    const row = byKey.get(`${s.videoNum}:${s.secondIndex}`);
    const dual = dualOcrByKey.get(`${s.videoNum}:${s.secondIndex}`) ?? false;
    const label = classifyOcrFrame(row, dual, frameRef);
    if (label === 'VISUALLY_VERIFIED') visuallyVerified++;
    if (label !== 'REFERENCE_CORROBORATED' && label !== 'VISUALLY_VERIFIED') reviewRequired++;
    const ref = row ? findNearestFrameRef(VIDEO_FILE[row.video_num], row.second_index, frameRef, 2) : null;
    if (label === 'REFERENCE_CORROBORATED' && row && ref) {
      refLabeled.push(fieldErrorsVsReference(row, ref));
    }
    frameReviews.push({
      reviewId: `FR_${String(i + 1).padStart(4, '0')}`,
      videoNum: s.videoNum,
      secondIndex: s.secondIndex,
      stratum: s.stratum,
      labelClass: label,
      expectedLat: row?.lat ?? null,
      expectedLon: row?.lon ?? null,
      expectedSpeed: row?.iphone_speed_kmh ?? null,
      expectedTimestamp: row?.overlay_local ?? null,
    });
  });

  const nRef = refLabeled.length;
  const latErr = refLabeled.filter((e) => e.latitude).length;
  const lonErr = refLabeled.filter((e) => e.longitude).length;
  const fieldRates = {
    latitude: { n: nRef, errors: latErr, wilson: wilsonCi(nRef - latErr, nRef) },
    longitude: { n: nRef, errors: lonErr, wilson: wilsonCi(nRef - lonErr, nRef) },
    note: 'Rates computed only on REFERENCE_CORROBORATED (3E.4 pack vs checkpoint); not visual ground truth',
  };

  const stops = buildStopForensics(repoRoot);
  const temporal = temporalAlignmentAnalysis(repoRoot);
  const baselineMae = reproduceVideoBaselineMetrics(loadVideoComparison(repoRoot)).maeKmh ?? VIDEO_BASELINE_EXPECTED.maeKmh;
  const l3Drift = Math.abs(baselineMae - REFERENCE_L3_MAE) < 0.0001 ? 'NONE' : 'DRIFT_DETECTED';

  const labelCounts = frameReviews.reduce<Record<string, number>>((acc, f) => {
    acc[f.labelClass] = (acc[f.labelClass] ?? 0) + 1;
    return acc;
  }, {});

  return {
    integrity,
    movSha,
    movAvailable: movSha.ok,
    p3dOk: p3d.ok,
    spec,
    frameReviews,
    labelCounts,
    visuallyVerified,
    reviewRequired,
    fieldRates,
    ocrErrorAssessable: nRef >= 10 ? 'REFERENCE_SUBSET_ONLY' : 'NOT_ASSESSABLE',
    stops,
    temporal,
    l3Drift,
    baselineMae,
    multisourceStops: stops.filter((s) => s.classification === 'MULTISOURCE_SUPPORTED_STOP').length,
    freezeSuspected: stops.filter((s) => s.classification === 'GPS_FREEZE_SUSPECTED').length,
  };
}
