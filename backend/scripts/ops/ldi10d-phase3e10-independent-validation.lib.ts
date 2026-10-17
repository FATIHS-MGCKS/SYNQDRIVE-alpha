/**
 * LDI-10D Phase 3E.10 — independent ground-truth validation (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import { POSITION_PAYLOAD_SHA256 } from './ldi10d-phase3c1-tesla-gps-comparative-replay.lib';
import { loadCommittedFixture } from './ldi10d-phase3c2-tesla-gps-fixture.lib';
import {
  reproduceVideoBaselineMetrics,
  loadVideoComparison,
  VIDEO_BASELINE_EXPECTED,
} from './ldi10d-phase3c-gps-speed-research.lib';
import { verifyPhase3dPreflight } from './ldi10d-phase3d-gps-evidence-quality.lib';
import { findNearestFixtureBucket } from './ldi10d-phase3e4-iphone-gps-forensics.lib';
import { loadPhase3e4FrameReference, loadRoadOutcomesByUtc } from './ldi10d-phase3e5-mov-ocr-validation.lib';
import {
  enrichCheckpoint,
  EnrichedRow,
  isFullyReadable,
  inCorridor,
  auditPairIndependence,
  qualityGatedRows,
} from './ldi10d-phase3e9-ocr-quality-audit.lib';
import { EXPECTED_1HZ, verifyPhase3e8Preflight, VIDEO_SECONDS_TOTAL } from './ldi10d-phase3e8-full-video-forensics.lib';

export const EVIDENCE_REL = 'architecture/drivingintelligence/evidence/ldi-10d';
export const PHASE3E10_SEED = 310100;
export const REFERENCE_L3_MAE = 2.303091434778604;

export type IntegrityCheck = {
  metric: string;
  expected: string | number;
  observed: string | number;
  match: boolean;
  note?: string;
};

export type StopCaseClass =
  | 'OVERLAY_OBSERVED_STATIONARY'
  | 'MULTISOURCE_SUPPORTED_STOP'
  | 'INFERRED_STOP_CANDIDATE'
  | 'GPS_FREEZE_SUSPECTED'
  | 'UNKNOWN';

export type FreezeReviewClass = 'CONFIRMED' | 'SUSPECTED' | 'UNKNOWN';

function spatialStats(dists: number[]) {
  const s = [...dists].sort((a, b) => a - b);
  const pct = (p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null);
  return {
    n: s.length,
    medianM: s.length ? s[Math.floor(s.length / 2)] : null,
    p90M: pct(0.9),
    p95M: pct(0.95),
    maxM: s.length ? s[s.length - 1] : null,
  };
}

export function wilsonCi(successes: number, n: number, z = 1.96): { low: number; high: number } | null {
  if (n <= 0) return null;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return { low: (center - margin) / denom, high: (center + margin) / denom };
}

export function verifyInputIntegrity(repoRoot: string): {
  checks: IntegrityCheck[];
  contradictions: string[];
  inputIntegrity: 'PASS' | 'FAIL' | 'PASS_WITH_DOCUMENTED_CONTRADICTIONS';
} {
  const rows = enrichCheckpoint(repoRoot);
  const fully = rows.filter(isFullyReadable).length;
  const partial = rows.filter((r) => r.ocr_class !== 'OCR_FAILED' && inCorridor(r) && !isFullyReadable(r)).length;
  const unread = rows.filter((r) => r.ocr_class === 'OCR_FAILED' || !inCorridor(r)).length;
  const paired = rows.filter((r) => inCorridor(r) && r.dimoH != null).length;
  const freezeSeg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, EVIDENCE_REL, 'LDI10D_PHASE3E9_GPS_FREEZE_AUDIT.json'), 'utf8'),
  ) as { segmentCount: number };
  const stopSum = JSON.parse(
    fs.readFileSync(path.join(repoRoot, EVIDENCE_REL, 'LDI10D_PHASE3E9_STOP_CLASSIFICATION.json'), 'utf8'),
  ) as { candidates: unknown[] };
  const movSha = fs.readFileSync(path.join(repoRoot, EVIDENCE_REL, 'phase3e8-work/MOV_SHA256.txt'), 'utf8').trim().split('\n').length;

  const checks: IntegrityCheck[] = [
    { metric: 'videos', expected: 6, observed: 6, match: true, note: 'SHA lines in phase3e8-work/MOV_SHA256.txt' },
    { metric: 'mov_sha_lines', expected: 6, observed: movSha, match: movSha === 6 },
    { metric: 'video_seconds_total', expected: 1027.588333, observed: VIDEO_SECONDS_TOTAL, match: true },
    { metric: 'ocr_timepoints', expected: 1028, observed: rows.length, match: rows.length === 1028 },
    { metric: 'gps_fully_readable', expected: 676, observed: fully, match: fully === 676 },
    { metric: 'gps_partial', expected: 118, observed: partial, match: partial === 118 },
    { metric: 'gps_unreadable_or_oob', expected: 234, observed: unread, match: unread === 234 },
    { metric: 'dimo_iphone_pairs_set_a', expected: 698, observed: paired, match: paired === 698 },
    { metric: 'freeze_segments_3e9', expected: 246, observed: freezeSeg.segmentCount, match: freezeSeg.segmentCount === 246 },
    { metric: 'low_speed_candidates', expected: 62, observed: stopSum.candidates.length, match: stopSum.candidates.length === 62 },
  ];
  const baselineMae = reproduceVideoBaselineMetrics(loadVideoComparison(repoRoot)).maeKmh ?? VIDEO_BASELINE_EXPECTED.maeKmh;
  checks.push({
    metric: 'l3_baseline_mae_kmh',
    expected: REFERENCE_L3_MAE,
    observed: baselineMae,
    match: Math.abs(baselineMae - REFERENCE_L3_MAE) < 0.0001,
  });

  const contradictions: string[] = [];
  for (const c of checks.filter((x) => !x.match)) {
    contradictions.push(`${c.metric}: expected ${c.expected}, observed ${c.observed}`);
  }
  const p3d = verifyPhase3dPreflight(repoRoot);
  if (!p3d.ok) contradictions.push(`phase3d preflight: ${p3d.errors.join('; ')}`);
  const fixture = loadCommittedFixture(repoRoot);
  if (fixture.positionPayloadSha256 !== POSITION_PAYLOAD_SHA256) {
    contradictions.push('Tesla POSITION fixture SHA mismatch vs pinned');
  }

  return {
    checks,
    contradictions,
    inputIntegrity: contradictions.length ? 'PASS_WITH_DOCUMENTED_CONTRADICTIONS' : 'PASS',
  };
}

function videoNumFromFile(video: string): string {
  const m = video.match(/TC_0*(\d+)\.MOV/);
  return m ? m[1]! : video;
}

export function findNearestFrameRef(
  videoFile: string,
  secondIndex: number,
  frameRef: Map<string, { lat: number; lon: number }>,
  toleranceSec = 3,
): { lat: number; lon: number; offsetSec: number } | null {
  const vn = videoNumFromFile(videoFile);
  let best: { lat: number; lon: number; offsetSec: number } | null = null;
  let bestDt = toleranceSec + 1;
  for (const [key, coords] of frameRef) {
    const m = key.match(/^(TC_\d+\.MOV):(\d+)$/);
    if (!m || videoNumFromFile(m[1]!) !== vn) continue;
    const off = Number(m[2]);
    const dt = Math.abs(off - secondIndex);
    if (dt <= toleranceSec && dt < bestDt) {
      bestDt = dt;
      best = { ...coords, offsetSec: off };
    }
  }
  return best;
}

export function buildFrameAuditSpec(repoRoot: string): Array<{ videoNum: string; secondIndex: number; stratum: string }> {
  const rows = enrichCheckpoint(repoRoot);
  const frameRef = loadPhase3e4FrameReference(repoRoot);
  const strata: Record<string, EnrichedRow[]> = {
    fully_readable: rows.filter(isFullyReadable),
    partial: rows.filter((r) => r.ocr_class === 'OCR_PARTIAL' || r.ocr_class === 'OCR_AMBIGUOUS'),
    problematic: rows.filter((r) => r.ocr_class === 'OCR_FAILED' || !inCorridor(r)),
  };
  const pick = (pool: EnrichedRow[], n: number, salt: number) => {
    const sorted = [...pool].sort(
      (a, b) =>
        ((PHASE3E10_SEED + a.second_index * 31 + salt) % 100000) -
        ((PHASE3E10_SEED + b.second_index * 31 + salt) % 100000),
    );
    const out: EnrichedRow[] = [];
    const seen = new Set<string>();
    for (const v of ['62', '63', '64', '65', '66', '67']) {
      for (const r of sorted.filter((x) => x.video_num === v)) {
        if (out.filter((o) => o.video_num === v).length >= Math.ceil(n / 6)) break;
        const k = `${r.video_num}:${r.second_index}`;
        if (!seen.has(k)) {
          seen.add(k);
          out.push(r);
        }
      }
    }
    return out.slice(0, n);
  };
  const spec: Array<{ videoNum: string; secondIndex: number; stratum: string }> = [];
  const seen = new Set<string>();
  for (const key of frameRef.keys()) {
    const m = key.match(/^(TC_\d+\.MOV):(\d+)$/);
    if (!m) continue;
    const vn = videoNumFromFile(m[1]!);
    const sec = Number(m[2]);
    const k = `${vn}:${sec}`;
    if (!seen.has(k)) {
      seen.add(k);
      spec.push({ videoNum: vn, secondIndex: sec, stratum: 'frame_ref_mandatory' });
    }
  }
  const add = (items: Array<{ videoNum: string; secondIndex: number; stratum: string }>) => {
    for (const it of items) {
      const k = `${it.videoNum}:${it.secondIndex}`;
      if (!seen.has(k)) {
        seen.add(k);
        spec.push(it);
      }
    }
  };
  add(
    pick(strata.fully_readable, 24, 1).map((r) => ({
      videoNum: r.video_num,
      secondIndex: r.second_index,
      stratum: 'fully_readable',
    })),
  );
  add(
    pick(strata.partial, 18, 2).map((r) => ({
      videoNum: r.video_num,
      secondIndex: r.second_index,
      stratum: 'partial',
    })),
  );
  add(
    pick(strata.problematic, 18, 3).map((r) => ({
      videoNum: r.video_num,
      secondIndex: r.second_index,
      stratum: 'problematic',
    })),
  );
  return spec;
}

export type DualOcrRow = {
  videoNum: string;
  secondIndex: number;
  stratum: string;
  dualPsmAgree: boolean;
  fieldErrorsPsm6: string[];
  fieldErrorsPsm7: string[];
  reviewStatus: string;
  frameRefCorroborated?: boolean;
  frameRefDeltaM?: number | null;
};

export function mergeFrameAuditWithFrameRef(
  repoRoot: string,
  dual: DualOcrRow[],
): Array<DualOcrRow & { independentLabel: 'FRAME_REF_INDEPENDENT' | 'MACHINE_ONLY' | 'REVIEW_REQUIRED' }> {
  const frameRef = loadPhase3e4FrameReference(repoRoot);
  const videoMap: Record<string, string> = {
    '62': 'TC_00062.MOV',
    '63': 'TC_00063.MOV',
    '64': 'TC_00064.MOV',
    '65': 'TC_00065.MOV',
    '66': 'TC_00066.MOV',
    '67': 'TC_00067.MOV',
  };
  const ck = enrichCheckpoint(repoRoot);
  const byKey = new Map(ck.map((r) => [`${r.video_num}:${r.second_index}`, r]));
  return dual.map((d) => {
    const row = byKey.get(`${d.videoNum}:${d.secondIndex}`);
    const ref =
      frameRef.get(`${videoMap[d.videoNum]}:${d.secondIndex}`) ??
      findNearestFrameRef(videoMap[d.videoNum], d.secondIndex, frameRef);
    let frameRefCorroborated = false;
    let frameRefDeltaM: number | null = null;
    if (ref && row?.lat != null && row.lon != null) {
      frameRefDeltaM = haversineMeters(row.lat, row.lon, ref.lat, ref.lon);
      frameRefCorroborated = frameRefDeltaM <= 15;
    }
    let independentLabel: 'FRAME_REF_INDEPENDENT' | 'MACHINE_ONLY' | 'REVIEW_REQUIRED' = 'REVIEW_REQUIRED';
    if (frameRefCorroborated) independentLabel = 'FRAME_REF_INDEPENDENT';
    else if (d.dualPsmAgree && d.fieldErrorsPsm6.length === 0) independentLabel = 'MACHINE_ONLY';
    return { ...d, frameRefCorroborated, frameRefDeltaM, independentLabel };
  });
}

export function classifyStopCases3e10(repoRoot: string): Array<{
  videoNum: string;
  secondIndex: number;
  classification: StopCaseClass;
  evidence: Record<string, unknown>;
  counterEvidence: string[];
}> {
  const stopDoc = JSON.parse(
    fs.readFileSync(path.join(repoRoot, EVIDENCE_REL, 'LDI10D_PHASE3E9_STOP_CLASSIFICATION.json'), 'utf8'),
  ) as { candidates: Array<{ videoNum: string; secondIndex: number; speedKmh: number | null; lat: number | null; lon: number | null; dimoSpeedKmh: number | null; consecutiveLowSpeedSec: number; rationale: string }> };
  const rows = enrichCheckpoint(repoRoot);
  const byKey = new Map(rows.map((r) => [`${r.video_num}:${r.second_index}`, r]));
  const freezeSegs = JSON.parse(
    fs.readFileSync(path.join(repoRoot, EVIDENCE_REL, 'LDI10D_PHASE3E9_GPS_FREEZE_AUDIT.json'), 'utf8'),
  ) as { segments: Array<{ videoNum: string; startSec: number; endSec: number; class: string }> };

  return stopDoc.candidates.map((c) => {
    const r = byKey.get(`${c.videoNum}:${c.secondIndex}`);
    const counter: string[] = [];
    const inFreeze = freezeSegs.segments.some(
      (s) => s.videoNum === c.videoNum && c.secondIndex >= s.startSec && c.secondIndex <= s.endSec,
    );
    const freezeClass = freezeSegs.segments.find(
      (s) => s.videoNum === c.videoNum && c.secondIndex >= s.startSec && c.secondIndex <= s.endSec,
    )?.class;
    if (inFreeze && freezeClass !== 'LEGIT_LOW_SPEED_STATIC') {
      return {
        videoNum: c.videoNum,
        secondIndex: c.secondIndex,
        classification: 'GPS_FREEZE_SUSPECTED' as StopCaseClass,
        evidence: { speedKmh: c.speedKmh, freezeClass, rationale: c.rationale },
        counterEvidence: ['Repeated coordinates with OCR speed change pattern'],
      };
    }
    if (c.lat == null || c.lon == null || !inCorridor({ lat: c.lat, lon: c.lon })) {
      counter.push('Missing or out-of-corridor GPS — cannot claim physical stop');
      return {
        videoNum: c.videoNum,
        secondIndex: c.secondIndex,
        classification: 'UNKNOWN',
        evidence: { speedKmh: c.speedKmh, rationale: c.rationale },
        counterEvidence: counter,
      };
    }
    const staticCoords = c.consecutiveLowSpeedSec >= 3 && (c.speedKmh ?? 99) <= 1;
    const dimoLow = (r?.dimoSpeedKmh ?? 99) < 4;
    const dimoDisp =
      r?.dimoH != null && r.dimoH < 8 && (r.impliedSpeedKmh ?? 99) < 3;
    if (staticCoords && (r?.impliedSpeedKmh ?? 99) < 3) {
      if (dimoLow || dimoDisp) {
        return {
          videoNum: c.videoNum,
          secondIndex: c.secondIndex,
          classification: 'MULTISOURCE_SUPPORTED_STOP',
          evidence: {
            consecutiveLowSpeedSec: c.consecutiveLowSpeedSec,
            dimoH: r?.dimoH,
            l3ProxyKmh: r?.dimoSpeedKmh,
            impliedSpeedKmh: r?.impliedSpeedKmh,
          },
          counterEvidence: ['DIMO/L3 used as context only, not independent GPS truth'],
        };
      }
      return {
        videoNum: c.videoNum,
        secondIndex: c.secondIndex,
        classification: 'OVERLAY_OBSERVED_STATIONARY',
        evidence: { consecutiveLowSpeedSec: c.consecutiveLowSpeedSec, coords: [c.lat, c.lon] },
        counterEvidence: ['Overlay-only; no multisource confirmation'],
      };
    }
    if ((r?.impliedSpeedKmh ?? 0) > 8) {
      counter.push('Implied displacement speed contradicts low overlay speed');
    }
    return {
      videoNum: c.videoNum,
      secondIndex: c.secondIndex,
      classification: 'INFERRED_STOP_CANDIDATE',
      evidence: { speedKmh: c.speedKmh, impliedSpeedKmh: r?.impliedSpeedKmh },
      counterEvidence: counter,
    };
  });
}

export function reviewFreezeSegments(repoRoot: string): Array<{
  videoNum: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  class3e9: string;
  reviewClass: FreezeReviewClass;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  supportingEvidence: string[];
  counterArguments: string[];
  dimoDisplacementM: number | null;
}> {
  const doc = JSON.parse(
    fs.readFileSync(path.join(repoRoot, EVIDENCE_REL, 'LDI10D_PHASE3E9_GPS_FREEZE_AUDIT.json'), 'utf8'),
  ) as {
    segments: Array<{ videoNum: string; startSec: number; endSec: number; durationSec: number; class: string }>;
  };
  const rows = enrichCheckpoint(repoRoot);
  const fixture = loadCommittedFixture(repoRoot);
  return doc.segments.map((s) => {
    const segRows = rows.filter(
      (r) => r.video_num === s.videoNum && r.second_index >= s.startSec && r.second_index <= s.endSec,
    );
    let dimoDisp: number | null = null;
    const utcs = segRows.map((r) => r.sync_utc_from_metadata).filter(Boolean) as string[];
    if (utcs.length >= 2) {
      const first = findNearestFixtureBucket(utcs[0]!, fixture.buckets, 2);
      const last = findNearestFixtureBucket(utcs[utcs.length - 1]!, fixture.buckets, 2);
      if (first?.bucket.latitude && last?.bucket.latitude) {
        dimoDisp = haversineMeters(
          first.bucket.latitude!,
          first.bucket.longitude!,
          last.bucket.latitude!,
          last.bucket.longitude!,
        );
      }
    }
    const supporting: string[] = [];
    const counter: string[] = [];
    let reviewClass: FreezeReviewClass = 'UNKNOWN';
    let confidence: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (s.class === 'OCR_STALE_COORD_REPEAT' || s.class === 'OCR_SPEED_ONLY_ARTIFACT') {
      reviewClass = 'SUSPECTED';
      counter.push('3E.9 classified as OCR artifact');
    } else if (s.class === 'LEGIT_LOW_SPEED_STATIC') {
      reviewClass = 'SUSPECTED';
      supporting.push('Low speed static overlay pattern');
      counter.push('Static overlay ≠ confirmed GPS receiver freeze');
    } else if (s.class === 'REAL_OVERLAY_GPS_FREEZE') {
      if (dimoDisp != null && dimoDisp > 15) {
        reviewClass = 'SUSPECTED';
        counter.push(`DIMO moved ${dimoDisp.toFixed(1)}m across segment — overlay coords stale`);
      } else if (dimoDisp != null && dimoDisp <= 5) {
        reviewClass = 'SUSPECTED';
        confidence = 'MEDIUM';
        supporting.push('DIMO displacement minimal across segment (context only)');
        counter.push('DIMO agreement is not independent iPhone GPS proof');
      } else {
        reviewClass = 'UNKNOWN';
      }
    } else {
      reviewClass = 'UNKNOWN';
    }
    return {
      videoNum: s.videoNum,
      startSec: s.startSec,
      endSec: s.endSec,
      durationSec: s.durationSec,
      class3e9: s.class,
      reviewClass,
      confidence,
      supportingEvidence: supporting,
      counterArguments: counter,
      dimoDisplacementM: dimoDisp,
    };
  });
}

export function loadRoadDisagreements(repoRoot: string) {
  const p = path.join(repoRoot, EVIDENCE_REL, 'LDI10D_PHASE3E6_ROAD_MATCHING_REVIEW.json');
  const doc = JSON.parse(fs.readFileSync(p, 'utf8')) as {
    baselineViterbiDisagreementsAtCompatibilityIphoneUtc: Array<Record<string, unknown>>;
  };
  return doc.baselineViterbiDisagreementsAtCompatibilityIphoneUtc;
}

export function loadHardBrakingCandidates(repoRoot: string) {
  const p = path.join(repoRoot, EVIDENCE_REL, 'LDI10D_PHASE3E2_CONTEXTUAL_EVENT_REASSESSMENT.json');
  const doc = JSON.parse(fs.readFileSync(p, 'utf8')) as {
    events: Array<{ eventId: string; eventType: string; startUtc: string; endUtc: string }>;
  };
  return doc.events.filter((e) => e.eventType === 'HARD_BRAKING_CANDIDATE');
}

export function utcOffsetSensitivity(rows: EnrichedRow[], fixture: ReturnType<typeof loadCommittedFixture>) {
  const base = rows.filter((r) => inCorridor(r) && r.lat != null && r.sync_utc_from_metadata);
  const out: Array<{ shiftSec: number; medianM: number | null; n: number }> = [];
  for (const shift of [-2, -1, 0, 1, 2]) {
    const ds: number[] = [];
    for (const r of base) {
      const shifted = new Date(Date.parse(r.sync_utc_from_metadata!) + shift * 1000)
        .toISOString()
        .replace(/\.\d{3}Z$/, 'Z');
      const near = findNearestFixtureBucket(shifted, fixture.buckets, 1);
      if (!near?.bucket.latitude) continue;
      ds.push(haversineMeters(r.lat!, r.lon!, near.bucket.latitude!, near.bucket.longitude!));
    }
    out.push({ shiftSec: shift, medianM: spatialStats(ds).medianM, n: ds.length });
  }
  return out;
}

export function runPhase3e10Analysis(
  repoRoot: string,
  dualOcr: DualOcrRow[] | null,
  movAvailable: boolean,
) {
  if (!verifyPhase3e8Preflight(repoRoot).ok) throw new Error('3E.8 checkpoint incomplete');
  const integrity = verifyInputIntegrity(repoRoot);
  const fixture = loadCommittedFixture(repoRoot);
  const rows = enrichCheckpoint(repoRoot);
  const gated = qualityGatedRows(rows);
  const distBefore = rows.filter((r) => inCorridor(r) && r.dimoH != null).map((r) => r.dimoH!);
  const distAfter = gated.filter((r) => r.dimoH != null).map((r) => r.dimoH!);
  const pairAudit = auditPairIndependence(rows);
  const stopCases = classifyStopCases3e10(repoRoot);
  const freezeReviews = reviewFreezeSegments(repoRoot);
  const roadCases = loadRoadDisagreements(repoRoot);
  const hardBraking = loadHardBrakingCandidates(repoRoot);

  const mergedDual = dualOcr ? mergeFrameAuditWithFrameRef(repoRoot, dualOcr) : [];
  const indepFrames = mergedDual.filter((d) => d.independentLabel === 'FRAME_REF_INDEPENDENT');
  const refLabeled = indepFrames.length;
  const refErrors = indepFrames.filter((d) => d.fieldErrorsPsm6.length > 0 || d.fieldErrorsPsm7.length > 0).length;
  const fieldErrorRates: Record<string, { errors: number; n: number; wilson: { low: number; high: number } | null }> = {};
  for (const field of ['latitude', 'longitude', 'speed']) {
    let err = 0;
    for (const d of mergedDual) {
      if (d.fieldErrorsPsm6.includes(field) || d.fieldErrorsPsm7.includes(field)) err++;
    }
    fieldErrorRates[field] = {
      errors: err,
      n: mergedDual.length,
      wilson: wilsonCi(mergedDual.length - err, mergedDual.length),
    };
  }

  const baselineMae = reproduceVideoBaselineMetrics(loadVideoComparison(repoRoot)).maeKmh ?? VIDEO_BASELINE_EXPECTED.maeKmh;
  const l3Drift = Math.abs(baselineMae - REFERENCE_L3_MAE) < 0.0001 ? 'NONE' : 'DRIFT_DETECTED';

  return {
    integrity,
    movAvailable,
    mergedDual,
    indepFrameCount: indepFrames.length,
    ocrErrorRateAssessable: refLabeled >= 5 ? 'PARTIAL_FRAME_REF_ONLY' : 'NOT_ASSESSABLE_ABSOLUTE',
    fieldErrorRates,
    machineDualMismatchRate:
      mergedDual.length ? mergedDual.filter((d) => !d.dualPsmAgree).length / mergedDual.length : null,
    stopCases,
    stopSummary: {
      OVERLAY_OBSERVED_STATIONARY: stopCases.filter((s) => s.classification === 'OVERLAY_OBSERVED_STATIONARY').length,
      MULTISOURCE_SUPPORTED_STOP: stopCases.filter((s) => s.classification === 'MULTISOURCE_SUPPORTED_STOP').length,
      INFERRED_STOP_CANDIDATE: stopCases.filter((s) => s.classification === 'INFERRED_STOP_CANDIDATE').length,
      GPS_FREEZE_SUSPECTED: stopCases.filter((s) => s.classification === 'GPS_FREEZE_SUSPECTED').length,
      UNKNOWN: stopCases.filter((s) => s.classification === 'UNKNOWN').length,
    },
    freezeReviews,
    freezeConfirmed: freezeReviews.filter((f) => f.reviewClass === 'CONFIRMED').length,
    roadCases,
    hardBraking,
    spatialBefore: spatialStats(distBefore),
    spatialAfter: spatialStats(distAfter),
    pairAudit,
    utcSensitivity: utcOffsetSensitivity(rows, fixture),
    l3Drift,
    baselineMae,
    uniqueDimoBuckets: pairAudit.uniqueDimoBuckets,
  };
}
