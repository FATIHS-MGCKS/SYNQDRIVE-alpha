/**
 * LDI-10D Phase 3E.7 — partial 1Hz manifest + sparse OCR audit (offline).
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
import {
  findNearestFixtureBucket,
  overlayLocalToUtc,
  parseOverlayOcrText,
  TESLA_TRIP_LAT_MAX,
  TESLA_TRIP_LAT_MIN,
} from './ldi10d-phase3e4-iphone-gps-forensics.lib';
import { loadPhase3e4FrameReference, loadRoadOutcomesByUtc, rawHasExplicitCoord } from './ldi10d-phase3e5-mov-ocr-validation.lib';
import { LON_MAX, LON_MIN } from './ldi10d-phase3e5-mov-ocr-validation.lib';
import { normalizeOutcome } from './ldi10d-phase3e3-road-matching-accuracy.lib';

export const PACK_REL = 'architecture/drivingintelligence/evidence/ldi-10d/phase3e7-partial-pack';
export const VIDEO_SECONDS_TOTAL = 1027.588333;

const VIDEO_MAP: Record<string, string> = {
  '62': 'TC_00062.MOV',
  '63': 'TC_00063.MOV',
  '64': 'TC_00064.MOV',
  '65': 'TC_00065.MOV',
  '66': 'TC_00066.MOV',
  '67': 'TC_00067.MOV',
};

export type EvidenceLevel =
  | 'EXTRACTED'
  | 'OCR_PARSED'
  | 'FRAME_VERIFIED'
  | 'TEMPORALLY_ALIGNED'
  | 'INDEPENDENTLY_VALIDATED';

export type FrameManifestRow = {
  videoNum: string;
  video: string;
  secondIndex: number;
  frameSha256: string;
  syncUtc: string;
};

export type OcrSampleRow = {
  frameId: string;
  videoNum: string;
  secondIndex: number;
  video: string;
  rawText: string;
  overlayLocal: string | null;
  overlayUtc: string | null;
  lat: number | null;
  lon: number | null;
  iphoneSpeedKmh: number | null;
  uncertainFields: string[];
  evidenceLevel: EvidenceLevel;
  dimoHaversineM: number | null;
  dimoBucketUtc: string | null;
  frameCrosscheckM: number | null;
  baselineRoad: string | null;
  viterbiRoad: string | null;
  tachoKmh: number | null;
  l3Kmh: number | null;
  gpsFreezeSuspected: boolean;
};

function parseManifestCsv(repoRoot: string): FrameManifestRow[] {
  const lines = fs
    .readFileSync(path.join(repoRoot, PACK_REL, 'FRAME_1HZ_MANIFEST.csv'), 'utf8')
    .trim()
    .split('\n');
  const meta = JSON.parse(
    fs.readFileSync(path.join(repoRoot, PACK_REL, 'MANIFEST.json'), 'utf8'),
  ) as {
    videos: Array<{ name: string; creation_time_utc: string }>;
  };
  const t0 = new Map(meta.videos.map((v) => [v.name.replace('.MOV', '').replace('TC_000', ''), Date.parse(v.creation_time_utc)]));
  const out: FrameManifestRow[] = [];
  for (const line of lines.slice(1)) {
    const [file, sec, sha] = line.split(',');
    const videoNum = file!;
    const secondIndex = parseInt(sec!, 10);
    const video = VIDEO_MAP[videoNum] ?? `TC_${videoNum}.MOV`;
    const base = t0.get(videoNum) ?? t0.get(video.replace('TC_000', '').replace('.MOV', ''));
    let syncUtc = '';
    if (base) syncUtc = new Date(base + secondIndex * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    out.push({ videoNum, video, secondIndex, frameSha256: sha!, syncUtc });
  }
  return out;
}

function frameIdToSecond(frameId: string): { videoNum: string; secondIndex: number } {
  const [vn, idx] = frameId.split('_');
  const secondIndex = parseInt(idx!, 10) - 1;
  return { videoNum: vn!, secondIndex };
}

export function loadOcrSamples(repoRoot: string): Array<{ frame: string; text: string }> {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot, PACK_REL, 'OCR_15S_RESEARCH.json'), 'utf8'),
  ) as Array<{ frame: string; text: string }>;
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

export function verifyPhase3e7Preflight(repoRoot: string): {
  ok: boolean;
  errors: string[];
  inputIntegrity: 'PASS' | 'FAIL';
  movPresent: boolean;
  frameManifestCount: number;
  ocrSampleCount: number;
} {
  const errors: string[] = [];
  const p3d = verifyPhase3dPreflight(repoRoot);
  if (!p3d.ok) errors.push(...p3d.errors);
  const fixture = loadCommittedFixture(repoRoot);
  if (fixture.positionPayloadSha256 !== POSITION_PAYLOAD_SHA256) errors.push('position hash');
  const pack = path.join(repoRoot, PACK_REL);
  if (!fs.existsSync(pack)) errors.push('pack missing');
  const manifest = fs.existsSync(path.join(pack, 'FRAME_1HZ_MANIFEST.csv'))
    ? parseManifestCsv(repoRoot)
    : [];
  if (manifest.length !== 1028) errors.push(`manifest ${manifest.length}`);
  const ocr = fs.existsSync(path.join(pack, 'OCR_15S_RESEARCH.json')) ? loadOcrSamples(repoRoot) : [];
  if (ocr.length !== 69) errors.push(`ocr ${ocr.length}`);
  const movPresent = fs.readdirSync(pack).some((f) => f.endsWith('.MOV') || f.endsWith('.mov'));
  return {
    ok: errors.length === 0,
    errors,
    inputIntegrity: errors.length === 0 ? 'PASS' : 'FAIL',
    movPresent,
    frameManifestCount: manifest.length,
    ocrSampleCount: ocr.length,
  };
}

export function runPhase3e7Analysis(repoRoot: string) {
  const preflight = verifyPhase3e7Preflight(repoRoot);
  const manifest = parseManifestCsv(repoRoot);
  const manifestByKey = new Map(manifest.map((m) => [`${m.videoNum}:${m.secondIndex}`, m]));
  const frameRef = loadPhase3e4FrameReference(repoRoot);
  const fixture = loadCommittedFixture(repoRoot);
  const roads = loadRoadOutcomesByUtc(repoRoot);
  const videoComp = loadVideoComparison(repoRoot);
  const tachoByUtc = new Map(
    videoComp.filter((r) => r.tachoKmh != null).map((r) => [r.bucketLabelUtc, r.tachoKmh!]),
  );
  const l3ByUtc = new Map(videoComp.map((r) => [r.bucketLabelUtc, r.l3SpeedKmh]));

  const samples = loadOcrSamples(repoRoot);
  const parsed: OcrSampleRow[] = [];
  let prev: OcrSampleRow | null = null;

  for (const s of samples) {
    const { videoNum, secondIndex } = frameIdToSecond(s.frame);
    const video = VIDEO_MAP[videoNum] ?? `TC_${videoNum}.MOV`;
    const man = manifestByKey.get(`${videoNum}:${secondIndex}`);
    const p = parseOverlayOcrText(s.text.replace(/\n/g, ' '));
    let overlayUtc: string | null = null;
    if (p.overlayLocal) {
      try {
        overlayUtc = overlayLocalToUtc(p.overlayLocal);
      } catch {
        overlayUtc = null;
      }
    }
    const lat = p.lat;
    const lon = p.lon;
    let level: EvidenceLevel = 'EXTRACTED';
    if (lat != null && lon != null && rawHasExplicitCoord(s.text.replace(/\n/g, ' '))) level = 'OCR_PARSED';
    else if (p.uncertainFields.length <= 2 && lat != null) level = 'OCR_PARSED';

    let frameCross: number | null = null;
    const ref = frameRef.get(`${video}:${secondIndex}`);
    if (ref && lat != null && lon != null) {
      frameCross = haversineMeters(lat, lon, ref.lat, ref.lon);
      if (frameCross <= 15) level = 'FRAME_VERIFIED';
    }
    const syncUtc = man?.syncUtc ?? null;
    if (syncUtc && overlayUtc && Math.abs(Date.parse(overlayUtc) - Date.parse(syncUtc)) <= 2) {
      if (level === 'FRAME_VERIFIED') level = 'INDEPENDENTLY_VALIDATED';
      else if (level === 'OCR_PARSED') level = 'TEMPORALLY_ALIGNED';
    }

    let dimoH: number | null = null;
    let dimoBucket: string | null = null;
    const utcForJoin = overlayUtc ?? syncUtc;
    if (lat != null && lon != null && utcForJoin) {
      const near = findNearestFixtureBucket(utcForJoin, fixture.buckets, 2);
      if (near?.bucket.latitude != null) {
        dimoH = haversineMeters(lat, lon, near.bucket.latitude!, near.bucket.longitude!);
        dimoBucket = near.bucket.bucketLabelUtc;
      }
    }

    const road = utcForJoin ? roads.get(utcForJoin) : undefined;
    const freeze =
      prev != null &&
      prev.videoNum === videoNum &&
      prev.lat === lat &&
      prev.lon === lon &&
      lat != null &&
      (prev.iphoneSpeedKmh ?? 0) !== (p.iphoneSpeedKmh ?? 0);

    const row: OcrSampleRow = {
      frameId: s.frame,
      videoNum,
      secondIndex,
      video,
      rawText: s.text,
      overlayLocal: p.overlayLocal,
      overlayUtc,
      lat,
      lon,
      iphoneSpeedKmh: p.iphoneSpeedKmh,
      uncertainFields: p.uncertainFields,
      evidenceLevel: level,
      dimoHaversineM: dimoH,
      dimoBucketUtc: dimoBucket,
      frameCrosscheckM: frameCross,
      baselineRoad: road ? normalizeOutcome(road.baseline) : null,
      viterbiRoad: road ? normalizeOutcome(road.viterbi) : null,
      tachoKmh: dimoBucket ? tachoByUtc.get(dimoBucket) ?? null : null,
      l3Kmh: dimoBucket ? l3ByUtc.get(dimoBucket) ?? null : null,
      gpsFreezeSuspected: freeze,
      };
    parsed.push(row);
    prev = row;
  }

  const comparisonDists = parsed
    .filter((r) => r.lat != null && r.dimoHaversineM != null)
    .map((r) => r.dimoHaversineM!);
  const independentlyValidated = parsed.filter((r) => r.evidenceLevel === 'INDEPENDENTLY_VALIDATED');
  const frameVerified = parsed.filter((r) => r.evidenceLevel === 'FRAME_VERIFIED' || r.evidenceLevel === 'INDEPENDENTLY_VALIDATED');

  const disagreements = parsed.filter(
    (r) => r.baselineRoad && r.viterbiRoad && r.baselineRoad !== r.viterbiRoad,
  );

  const freezeCases = parsed.filter((r) => r.gpsFreezeSuspected);

  const l3Pairs = parsed.filter((r) => r.l3Kmh != null && r.tachoKmh != null);
  const l3Errors = l3Pairs.map((r) => Math.abs(r.l3Kmh! - r.tachoKmh!));
  const l3Mae =
    l3Errors.length ? l3Errors.reduce((a, b) => a + b, 0) / l3Errors.length : null;

  const p3d = runPhase3dAnalysis(repoRoot);
  const baselineMae = reproduceVideoBaselineMetrics(videoComp).maeKmh ?? VIDEO_BASELINE_EXPECTED.maeKmh;

  const perSecond = fixture.buckets.map((b) => {
    const ocr = parsed.find((p) => p.dimoBucketUtc === b.bucketLabelUtc || p.overlayUtc === b.bucketLabelUtc);
    return {
      bucketLabelUtc: b.bucketLabelUtc,
      dimoAvailability: b.availability,
      manifest1Hz: manifest.some(
        (m) => m.syncUtc === b.bucketLabelUtc,
      ),
      ocr15sSample: ocr != null,
      evidenceLevel: ocr?.evidenceLevel ?? 'MISSING',
    };
  });

  return {
    preflight,
    manifest,
    parsed,
    spatial: spatialStats(comparisonDists),
    independentlyValidated,
    frameVerifiedCount: frameVerified.length,
    disagreements,
    freezeCases,
    l3Sparse: { n: l3Pairs.length, maeKmh: l3Mae },
    perSecond,
    p3d,
    baselineMae,
    timestampAlignment:
      parsed.filter((r) => r.overlayUtc && r.dimoBucketUtc).length > 0 ? 'OVERLAY_JOINED_TO_DIMO_BUCKET' : 'PARTIAL',
  };
}
