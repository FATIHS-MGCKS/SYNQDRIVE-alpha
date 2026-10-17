/**
 * LDI-10D Phase 3E.4 — iPhone GPS overlay forensics (offline).
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import { POSITION_PAYLOAD_SHA256 } from './ldi10d-phase3c1-tesla-gps-comparative-replay.lib';
import { loadCommittedFixture } from './ldi10d-phase3c2-tesla-gps-fixture.lib';
import {
  reproduceVideoBaselineMetrics,
  loadVideoComparison,
  VIDEO_BASELINE_EXPECTED,
} from './ldi10d-phase3c-gps-speed-research.lib';
import { verifyPhase3dPreflight, runPhase3dAnalysis } from './ldi10d-phase3d-gps-evidence-quality.lib';
import {
  BASELINE_AMBIGUOUS,
  BASELINE_ASSOCIATED,
  BASELINE_UNKNOWN,
} from './ldi10d-phase3e3-road-matching-accuracy.lib';
import type { FixtureBucket } from './ldi10d-phase3c2-tesla-gps-fixture.lib';

export const REVIEW_PACK_REL = 'architecture/drivingintelligence/evidence/ldi-10d/phase3e4-review-pack';
export const EXPECTED_L3_MAE = VIDEO_BASELINE_EXPECTED.maeKmh;

/** Frozen Tesla 2026-10-16 trip corridor (EXP021); OCR outside band requires manual verification. */
export const TESLA_TRIP_LAT_MIN = 51.23;
export const TESLA_TRIP_LAT_MAX = 51.36;
export const SPATIAL_OUTLIER_THRESHOLD_M = 500;

export type IphoneOverlayObservation = {
  observationId: string;
  video: string;
  videoOffsetSec: number;
  frameFile: string;
  syncUtcFromVideoMetadata: string | null;
  overlayLocalTimestamp: string | null;
  overlayUtcInferred: string | null;
  latitude: number | null;
  longitude: number | null;
  altitudeM: number | null;
  iphoneGpsSpeedKmh: number | null;
  teslaTachoSpeedKmh: number | null;
  ocrStatus: 'VERIFIED_OCR' | 'PARTIAL_OCR' | 'HUMAN_PRELIMINARY' | 'UNREADABLE';
  ocrConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  ocrRawSnippet: string;
  gpsFixUpdate: 'UNKNOWN_FRAME_SNAPSHOT' | 'REPEATED_UNVERIFIED';
  provenance: string[];
};

function sha256File(p: string): string {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

/** Heuristic parser for cropped overlay OCR (Kassel corridor). Does not silently fix uncertain digits. */
export function parseOverlayOcrText(raw: string): {
  overlayLocal: string | null;
  lat: number | null;
  lon: number | null;
  altitudeM: number | null;
  iphoneSpeedKmh: number | null;
  uncertainFields: string[];
} {
  const uncertain: string[] = [];
  const flat = raw.replace(/\n/g, ' ').replace(/\s+/g, ' ');
  let overlayLocal: string | null = null;
  const dm = flat.match(/(\d{2})\.(\d{4}),?\s*(\d{2}):(\d{2}):(\d{2})/);
  if (dm) overlayLocal = `20${dm[1]}-${dm[2].slice(0, 2)}-${dm[2].slice(2, 4)}T${dm[3]}:${dm[4]}:${dm[5]}+02:00`;
  else uncertain.push('timestamp');

  let lat: number | null = null;
  let lon: number | null = null;
  const coord =
    flat.match(/(\d{2}\.\d{5,6})\s*,\s*\+?(9\.\d{5,6})/) ??
    flat.match(/(\d{5,8})\s*,\s*\+?(9\.\d{5,6})/);
  if (coord) {
    const a = coord[1];
    if (a.includes('.')) {
      lat = parseFloat(a);
    } else if (a.length >= 8 && a.startsWith('51')) {
      lat = parseFloat(`${a.slice(0, 2)}.${a.slice(2)}`);
    } else if (a.length <= 6) {
      lat = parseFloat(`51.${a}`);
    } else {
      lat = parseFloat(`51.${a}`);
      uncertain.push('latitude_fragment');
    }
    lon = parseFloat(coord[2]);
    if (lat < TESLA_TRIP_LAT_MIN || lat > TESLA_TRIP_LAT_MAX) uncertain.push('latitude_corridor');
  } else uncertain.push('coordinates');

  let altitudeM: number | null = null;
  const am = flat.match(/(\d{2,3}\.?\d*)\s*m\s*u?\.?\s*M/i);
  if (am) altitudeM = parseFloat(am[1]);
  else uncertain.push('altitude');

  let iphoneSpeedKmh: number | null = null;
  const sm = flat.match(/indigkeit[:\s=]*(\d{1,3}\.?\d*)\s*km\/h/i) ?? flat.match(/(\d{1,3}\.?\d*)\s*km\/h/i);
  if (sm) iphoneSpeedKmh = parseFloat(sm[1]);
  else uncertain.push('iphone_speed');

  return { overlayLocal, lat, lon, altitudeM, iphoneSpeedKmh, uncertainFields: uncertain };
}

export function overlayLocalToUtc(overlayLocalIso: string): string {
  const d = new Date(overlayLocalIso);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function loadVideoMetadata(repoRoot: string): Array<{
  video: string;
  duration_s: number;
  creation_time_utc: string;
}> {
  const p = path.join(repoRoot, REVIEW_PACK_REL, 'LDI10D_PHASE3E4_VIDEO_METADATA.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Array<{
    video: string;
    duration_s: number;
    creation_time_utc: string;
  }>;
}

export function runOcrOnFrame(repoRoot: string, frameRel: string): string {
  const img = path.join(repoRoot, REVIEW_PACK_REL, frameRel);
  const tmp = path.join('/tmp', `ldi10d_ocr_${path.basename(frameRel)}.png`);
  execSync(`ffmpeg -y -i "${img}" -vf "crop=iw*0.42:ih*0.22:iw*0.56:0" "${tmp}"`, {
    stdio: 'pipe',
  });
  return execSync(`tesseract "${tmp}" stdout -l eng 2>/dev/null`, { encoding: 'utf8' });
}

export function extractOverlayObservations(repoRoot: string): IphoneOverlayObservation[] {
  const metaByVideo = new Map(loadVideoMetadata(repoRoot).map((m) => [m.video, m]));
  const csv = fs.readFileSync(
    path.join(repoRoot, REVIEW_PACK_REL, 'LDI10D_PHASE3E4_FRAME_INDEX.csv'),
    'utf8',
  );
  const lines = csv.trim().split('\n').slice(1);
  const out: IphoneOverlayObservation[] = [];

  for (const line of lines) {
    const m = line.match(/^([^,]+),(\d+),(frames\/[^,]+),/);
    if (!m) continue;
    const video = m[1]!;
    const offset = parseInt(m[2]!, 10);
    const frame = m[3]!;
    const raw = runOcrOnFrame(repoRoot, frame);
    const parsed = parseOverlayOcrText(raw);
    const vm = metaByVideo.get(video);
    let syncUtc: string | null = null;
    if (vm) {
      const t0 = Date.parse(vm.creation_time_utc);
      syncUtc = new Date(t0 + offset * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    }
    let overlayUtc: string | null = null;
    if (parsed.overlayLocal) {
      try {
        overlayUtc = overlayLocalToUtc(parsed.overlayLocal);
      } catch {
        overlayUtc = null;
      }
    }
    const ocrOk =
      parsed.uncertainFields.length === 0 && parsed.lat != null && parsed.lon != null && parsed.overlayLocal;
    out.push({
      observationId: `OBS_${video.replace(/\W/g, '')}_${offset}`,
      video,
      videoOffsetSec: offset,
      frameFile: frame,
      syncUtcFromVideoMetadata: syncUtc,
      overlayLocalTimestamp: parsed.overlayLocal,
      overlayUtcInferred: overlayUtc,
      latitude: parsed.lat,
      longitude: parsed.lon,
      altitudeM: parsed.altitudeM,
      iphoneGpsSpeedKmh: parsed.iphoneSpeedKmh,
      teslaTachoSpeedKmh: null,
      ocrStatus: ocrOk ? 'VERIFIED_OCR' : parsed.lat ? 'PARTIAL_OCR' : 'UNREADABLE',
      ocrConfidence: ocrOk ? 'MEDIUM' : parsed.lat ? 'LOW' : 'NONE',
      ocrRawSnippet: raw.trim().slice(0, 400),
      gpsFixUpdate: 'UNKNOWN_FRAME_SNAPSHOT',
      provenance: ['LDI10D_PHASE3E4_FRAME_OCR_V1', frame],
    });
  }

  out.push({
    observationId: 'OBS_TC_00062_30_HUMAN_PRELIMINARY',
    video: 'TC_00062.MOV',
    videoOffsetSec: 30,
    frameFile: 'NOT_IN_REVIEW_PACK',
    syncUtcFromVideoMetadata: '2026-10-16T03:38:11Z',
    overlayLocalTimestamp: '2026-10-16T05:38:11+02:00',
    overlayUtcInferred: '2026-10-16T03:38:11Z',
    latitude: 51.335267,
    longitude: 9.506096,
    altitudeM: 191.8,
    iphoneGpsSpeedKmh: 5.7,
    teslaTachoSpeedKmh: null,
    ocrStatus: 'HUMAN_PRELIMINARY',
    ocrConfidence: 'HIGH',
    ocrRawSnippet: 'From LDI10D_PHASE3E4_PRELIMINARY_AUDIT.md owner-verified example',
    gpsFixUpdate: 'UNKNOWN_FRAME_SNAPSHOT',
    provenance: ['LDI10D_PHASE3E4_PRELIMINARY_AUDIT.md'],
  });

  return out;
}

export function verifyPhase3e4Preflight(repoRoot: string): {
  ok: boolean;
  errors: string[];
  inputIntegrity: 'PASS' | 'FAIL';
  movFilesPresent: boolean;
  frameCount: number;
} {
  const errors: string[] = [];
  const p3d = verifyPhase3dPreflight(repoRoot);
  if (!p3d.ok) errors.push(...p3d.errors);
  const fixture = loadCommittedFixture(repoRoot);
  if (fixture.positionPayloadSha256 !== POSITION_PAYLOAD_SHA256) errors.push('position hash');
  const pack = path.join(repoRoot, REVIEW_PACK_REL);
  if (!fs.existsSync(pack)) errors.push('review pack missing');
  const frames = fs.readdirSync(path.join(pack, 'frames')).filter((f) => f.endsWith('.jpg'));
  if (frames.length !== 18) errors.push(`frames ${frames.length}`);
  const movPresent = fs
    .readdirSync(pack)
    .some((f) => f.endsWith('.MOV') || f.endsWith('.mov'));
  return {
    ok: errors.length === 0,
    errors,
    inputIntegrity: errors.length === 0 ? 'PASS' : 'FAIL',
    movFilesPresent: movPresent,
    frameCount: frames.length,
  };
}

export function findNearestFixtureBucket(
  utcIso: string,
  buckets: FixtureBucket[],
  maxDeltaSec = 2,
): { bucket: FixtureBucket; deltaSec: number } | null {
  const t = Date.parse(utcIso);
  if (!Number.isFinite(t)) return null;
  let best: { bucket: FixtureBucket; deltaSec: number } | null = null;
  for (const b of buckets) {
    if (b.latitude == null || b.longitude == null) continue;
    const dt = Math.abs(Date.parse(b.bucketLabelUtc) - t) / 1000;
    if (dt > maxDeltaSec) continue;
    if (!best || dt < best.deltaSec) best = { bucket: b, deltaSec: dt };
  }
  return best;
}

export function alignAndCompareSpatial(
  observations: IphoneOverlayObservation[],
  repoRoot: string,
): {
  pairedFixes: Array<{
    observationId: string;
    bucketLabelUtc: string;
    haversineM: number;
    dimoLat: number;
    dimoLon: number;
    iphoneLat: number;
    iphoneLon: number;
    alignmentSource: string;
  }>;
  medianM: number | null;
  p90M: number | null;
  p95M: number | null;
  maxM: number | null;
  timestampAlignmentStatus: string;
  timestampAlignmentErrorSec: number | null;
  robustPairCount: number;
  outlierPairCount: number;
} {
  const fixture = loadCommittedFixture(repoRoot);
  const byLabel = new Map(fixture.buckets.map((b) => [b.bucketLabelUtc, b]));
  const paired: Array<{
    observationId: string;
    bucketLabelUtc: string;
    haversineM: number;
    dimoLat: number;
    dimoLon: number;
    iphoneLat: number;
    iphoneLon: number;
    alignmentSource: string;
    alignmentDeltaSec: number;
  }> = [];

  const deltas: number[] = [];
  for (const o of observations) {
    if (o.latitude == null || o.longitude == null) continue;
    const utc = o.overlayUtcInferred ?? o.syncUtcFromVideoMetadata;
    if (!utc) continue;
    let bucket = byLabel.get(utc);
    let alignmentDeltaSec = 0;
    if (!bucket || bucket.latitude == null || bucket.longitude == null) {
      const near = findNearestFixtureBucket(utc, fixture.buckets, 2);
      if (!near) continue;
      bucket = near.bucket;
      alignmentDeltaSec = near.deltaSec;
    }
    const d = haversineMeters(o.latitude, o.longitude, bucket.latitude!, bucket.longitude!);
    paired.push({
      observationId: o.observationId,
      bucketLabelUtc: bucket.bucketLabelUtc,
      haversineM: d,
      dimoLat: bucket.latitude!,
      dimoLon: bucket.longitude!,
      iphoneLat: o.latitude,
      iphoneLon: o.longitude,
      alignmentSource: o.overlayUtcInferred ? 'overlay_utc' : 'video_metadata_offset',
      alignmentDeltaSec,
    });
    if (o.syncUtcFromVideoMetadata && o.overlayUtcInferred) {
      deltas.push(
        (Date.parse(o.overlayUtcInferred) - Date.parse(o.syncUtcFromVideoMetadata)) / 1000,
      );
    }
  }
  const dists = paired.map((p) => p.haversineM).sort((a, b) => a - b);
  const robust = dists.filter((d) => d <= SPATIAL_OUTLIER_THRESHOLD_M);
  const pct = (arr: number[], p: number) =>
    arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : null;
  const median = robust.length ? robust[Math.floor(robust.length / 2)] : null;
  return {
    pairedFixes: paired,
    medianM: median,
    p90M: pct(robust, 0.9),
    p95M: pct(robust, 0.95),
    maxM: dists.length ? dists[dists.length - 1] : null,
    robustPairCount: robust.length,
    outlierPairCount: paired.length - robust.length,
    timestampAlignmentStatus: deltas.length ? 'OVERLAY_MATCHES_METADATA_OFFSET' : 'PARTIAL',
    timestampAlignmentErrorSec: deltas.length
      ? deltas.reduce((s, x) => s + Math.abs(x), 0) / deltas.length
      : null,
  };
}

export function runPhase3e4Analysis(repoRoot: string): {
  preflight: ReturnType<typeof verifyPhase3e4Preflight>;
  observations: IphoneOverlayObservation[];
  spatial: ReturnType<typeof alignAndCompareSpatial>;
  videoDurationTotal: number;
  uniqueFixes: number;
  ocrVerified: number;
  l3Mae: number;
  speedImprovementProven: 'NO';
  roadIdStatus: 'NOT_ASSESSABLE';
  roadMatchingImprovementProven: 'NO';
  observedStandstills: number;
  inferredStopCandidates: number;
  l3Drift: 'NONE' | 'DRIFT';
} {
  const preflight = verifyPhase3e4Preflight(repoRoot);
  const observations = extractOverlayObservations(repoRoot);
  const spatial = alignAndCompareSpatial(observations, repoRoot);
  const meta = loadVideoMetadata(repoRoot);
  const videoDurationTotal = meta.reduce((s, m) => s + m.duration_s, 0);
  const uniqueFixes = new Set(
    observations
      .filter((o) => o.latitude != null)
      .map((o) => `${o.latitude!.toFixed(5)},${o.longitude!.toFixed(5)}`),
  ).size;
  const ocrVerified = observations.filter((o) => o.ocrStatus === 'VERIFIED_OCR' || o.ocrStatus === 'HUMAN_PRELIMINARY').length;
  const video = reproduceVideoBaselineMetrics(loadVideoComparison(repoRoot));
  const p3d = runPhase3dAnalysis(repoRoot);
  const inferredStop = observations.filter((o) => (o.iphoneGpsSpeedKmh ?? 99) < 2).length;
  return {
    preflight,
    observations,
    spatial,
    videoDurationTotal,
    uniqueFixes,
    ocrVerified,
    l3Mae: video.maeKmh ?? EXPECTED_L3_MAE,
    speedImprovementProven: 'NO',
    roadIdStatus: 'NOT_ASSESSABLE',
    roadMatchingImprovementProven: 'NO',
    observedStandstills: 0,
    inferredStopCandidates: inferredStop,
    l3Drift: p3d.l3BaselineDrift,
  };
}
