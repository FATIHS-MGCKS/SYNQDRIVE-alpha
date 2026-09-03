import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  alignClip,
  alignmentOutputSha256,
  AMBIGUITY_MAE_DELTA_KMH,
  buildSignalSurfaceQuality,
  buildSpeedSeries,
  CANONICAL_TELEMETRY_JSONL_SHA256,
  computeProviderDeliveryMetrics,
  deriveTelemetryAtUtc,
  detectStaleHolds,
  loadCanonicalTelemetryJsonl,
  makeTelemetryRow,
  runAlignmentWorkbench,
  searchSpeedOffsetCandidates,
  stableStringify,
  type ExternalGtClip,
  type ExternalGtDocument,
} from './reference-capture-rd003-video-gt-alignment';

const TELEMETRY_JSONL = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/dimo-lte-r1-reference-drive-003-video-gt-correlation-source.jsonl',
);
const EXTERNAL_GT = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd003-video-ground-truth-observations.json',
);
const ALIGN_SCRIPT = path.resolve(
  __dirname,
  '../../../../scripts/ops/reference-capture-drive-003-video-gt-align.ts',
);

const hasTelemetry = fs.existsSync(TELEMETRY_JSONL);
const hasExternalGt = fs.existsSync(EXTERNAL_GT);

function makeClip(overrides: Partial<ExternalGtClip> = {}): ExternalGtClip {
  return {
    clipId: 'RD003_GT_CLIP_TEST',
    fileName: 'IMG_TEST.mp4',
    videoDurationSeconds: 30,
    videoDurationUncertainty: 0.5,
    evidenceStatus: 'PENDING_EXTERNAL_REVIEW',
    observations: [],
    ...overrides,
  };
}

function syntheticSpeedTelemetry(
  startUtc: string,
  speeds: number[],
  intervalSeconds = 1,
  surface: 'LATEST_LIVE' | 'HF_HISTORICAL' | 'LATEST_SLOW' = 'LATEST_LIVE',
) {
  const baseMs = Date.parse(startUtc);
  return speeds.map((speed, i) => {
    const ts = new Date(baseMs + i * intervalSeconds * 1000).toISOString();
    return makeTelemetryRow({
      providerField: 'speed',
      acquisitionSurface: surface,
      providerTimestamp: ts,
      synqReceivedAt: ts,
      requestStartedAt: ts,
      requestCompletedAt: ts,
      rawValueJson: speed,
      physicalSampleFingerprint: `fp-${i}-${speed}`,
    });
  });
}

describe('reference-capture-rd003-video-gt-alignment', () => {
  describe('A) empty/PENDING external GT cannot produce VALIDATED alignment', () => {
    (hasExternalGt ? it : it.skip)('pending observations yield PENDING_EXTERNAL_GT', () => {
      const externalGt = JSON.parse(fs.readFileSync(EXTERNAL_GT, 'utf8')) as ExternalGtDocument;
      const telemetry = loadCanonicalTelemetryJsonl(TELEMETRY_JSONL);
      const result = runAlignmentWorkbench({ telemetryRows: telemetry, externalGt });
      expect(result.clipAlignments.every((c) => c.alignmentStatus !== 'VALIDATED')).toBe(true);
      expect(result.clipAlignments.every((c) => c.alignmentStatus === 'PENDING_EXTERNAL_GT')).toBe(
        true,
      );
      expect(result.alignmentSummary.GROUND_TRUTH_VALIDATED).toBe('NO');
    });
  });

  describe('B) visible clock alone cannot produce VALIDATED alignment', () => {
    it('clock prior without speed observations stays non-validated', () => {
      const clip = makeClip({
        candidateAbsoluteTime: {
          candidateStartUtc: '2026-09-02T19:03:49.400Z',
          uncertaintySeconds: 30,
          status: 'CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY',
        },
        observations: [],
      });
      const telemetry = syntheticSpeedTelemetry('2026-09-02T19:03:49.400Z', [0, 10, 20, 30]);
      const result = alignClip({ clip, telemetryRows: telemetry });
      expect(result.alignmentStatus).not.toBe('VALIDATED');
      expect(result.stages.clockPrior.status).toBe('CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY');
    });
  });

  describe('C) candidate clock windows do not mutate telemetry', () => {
    (hasTelemetry ? it : it.skip)('canonical telemetry file unchanged after align CLI', () => {
      const beforeSha = crypto.createHash('sha256').update(fs.readFileSync(TELEMETRY_JSONL)).digest('hex');
      const outDir = fs.mkdtempSync(path.join('/tmp', 'rd003-align-'));
      execFileSync(
        'npx',
        ['ts-node', '-r', 'tsconfig-paths/register', ALIGN_SCRIPT, `--out-dir=${outDir}`],
        { cwd: path.resolve(__dirname, '../../../..'), encoding: 'utf8' },
      );
      const afterSha = crypto.createHash('sha256').update(fs.readFileSync(TELEMETRY_JSONL)).digest('hex');
      expect(afterSha).toBe(beforeSha);
      expect(afterSha).toBe(CANONICAL_TELEMETRY_JSONL_SHA256);
    });
  });

  describe('D) acquisition surfaces remain separate', () => {
    (hasTelemetry ? it : it.skip)('signal surface quality has per-surface entries', () => {
      const telemetry = loadCanonicalTelemetryJsonl(TELEMETRY_JSONL);
      const quality = buildSignalSurfaceQuality(telemetry);
      expect(quality.speed.HF_HISTORICAL.observationCount).toBeGreaterThan(0);
      expect(quality.speed.LATEST_LIVE.observationCount).toBeGreaterThan(0);
      expect(quality.speed.LATEST_SLOW).toEqual({ observationCount: 0, status: 'NOT_OBSERVED' });
    });
  });

  describe('E) providerTimestamp and synqReceivedAt remain separate', () => {
    it('computes distinct provider age and ingress latency', () => {
      const row = makeTelemetryRow({
        providerField: 'speed',
        acquisitionSurface: 'LATEST_LIVE',
        providerTimestamp: '2026-09-02T19:00:00.000Z',
        synqReceivedAt: '2026-09-02T19:00:05.000Z',
        requestStartedAt: '2026-09-02T19:00:04.500Z',
        requestCompletedAt: '2026-09-02T19:00:04.900Z',
        rawValueJson: 50,
      });
      const m = computeProviderDeliveryMetrics(row);
      expect(m.providerSampleAgeSeconds).toBe(5);
      expect(m.requestStartToIngressSeconds).toBe(0.5);
      expect(m.requestDurationSeconds).toBeCloseTo(0.4);
    });
  });

  describe('F) LATEST_LIVE name cannot imply zero sample age', () => {
    it('flags positive provider sample age on LATEST_LIVE', () => {
      const row = makeTelemetryRow({
        providerField: 'speed',
        acquisitionSurface: 'LATEST_LIVE',
        providerTimestamp: '2026-09-02T18:00:00.000Z',
        synqReceivedAt: '2026-09-02T19:00:00.000Z',
        rawValueJson: 60,
      });
      const m = computeProviderDeliveryMetrics(row);
      expect(m.providerSampleAgeSeconds).toBeGreaterThan(0);
      const quality = buildSignalSurfaceQuality([row]);
      expect(quality.speed.LATEST_LIVE.LATEST_LIVE_EQUALS_FRESH_PHYSICAL_SAMPLE).toBe('NO');
    });
  });

  describe('G) synthetic known speed offset can be recovered', () => {
    it('recovers +2s offset from synthetic fixture', () => {
      const telemetry = syntheticSpeedTelemetry('2026-09-02T19:00:00.000Z', [0, 10, 20, 30, 40, 50]);
      const series = buildSpeedSeries(telemetry);
      const clip = makeClip({
        candidateAbsoluteTime: {
          candidateStartUtc: '2026-09-02T19:00:00.000Z',
          uncertaintySeconds: 5,
          status: 'CANDIDATE',
        },
        observations: [
          {
            observationId: 'o1',
            videoTimeSeconds: 0,
            videoTimeUncertaintySeconds: 0.1,
            observationType: 'SPEED',
            value: 20,
            unit: 'km/h',
            valueUncertainty: 1,
            confidence: 'VALIDATED',
            evidenceClass: 'DIRECT_VISUAL',
            sourceMethod: 'TEST_FIXTURE',
            notes: null,
          },
          {
            observationId: 'o2',
            videoTimeSeconds: 2,
            videoTimeUncertaintySeconds: 0.1,
            observationType: 'SPEED',
            value: 40,
            unit: 'km/h',
            valueUncertainty: 1,
            confidence: 'VALIDATED',
            evidenceClass: 'DIRECT_VISUAL',
            sourceMethod: 'TEST_FIXTURE',
            notes: null,
          },
        ],
      });
      const search = searchSpeedOffsetCandidates({
        gtObservations: clip.observations,
        speedSeries: series,
        clipStartUtcMs: Date.parse('2026-09-02T19:00:00.000Z'),
        searchFromOffsetSeconds: -3,
        searchToOffsetSeconds: 3,
        stepSeconds: 1,
      });
      expect(search.best?.offsetSeconds).toBe(2);
    });
  });

  describe('H) two similarly strong offsets return AMBIGUOUS', () => {
    it('triggers ambiguity when MAE delta within threshold', () => {
      const telemetry = syntheticSpeedTelemetry('2026-09-02T19:00:00.000Z', [50, 50, 50, 50, 50]);
      const series = buildSpeedSeries(telemetry);
      const clip = makeClip({
        candidateAbsoluteTime: {
          candidateStartUtc: '2026-09-02T19:00:00.000Z',
          uncertaintySeconds: 2,
          status: 'CANDIDATE',
        },
        observations: [
          {
            observationId: 'o1',
            videoTimeSeconds: 0,
            videoTimeUncertaintySeconds: 0.1,
            observationType: 'SPEED',
            value: 50,
            unit: 'km/h',
            valueUncertainty: 1,
            confidence: 'VALIDATED',
            evidenceClass: 'DIRECT_VISUAL',
            sourceMethod: 'TEST_FIXTURE',
            notes: null,
          },
          {
            observationId: 'o2',
            videoTimeSeconds: 1,
            videoTimeUncertaintySeconds: 0.1,
            observationType: 'SPEED',
            value: 50,
            unit: 'km/h',
            valueUncertainty: 1,
            confidence: 'VALIDATED',
            evidenceClass: 'DIRECT_VISUAL',
            sourceMethod: 'TEST_FIXTURE',
            notes: null,
          },
        ],
      });
      const search = searchSpeedOffsetCandidates({
        gtObservations: clip.observations,
        speedSeries: series,
        clipStartUtcMs: Date.parse('2026-09-02T19:00:00.000Z'),
        searchFromOffsetSeconds: -2,
        searchToOffsetSeconds: 2,
        stepSeconds: 1,
      });
      expect(search.ambiguous).toBe(true);
      expect(search.status).toBe('AMBIGUOUS');
      expect(AMBIGUITY_MAE_DELTA_KMH).toBe(1.0);
    });
  });

  describe('I) large telemetry gaps return INSUFFICIENT_CADENCE', () => {
    it('refuses interpolation across large gap', () => {
      const series = [
        { utcMs: Date.parse('2026-09-02T19:00:00.000Z'), value: 10 },
        { utcMs: Date.parse('2026-09-02T19:00:20.000Z'), value: 30 },
      ];
      const pt = deriveTelemetryAtUtc(series, Date.parse('2026-09-02T19:00:10.000Z'), 5);
      expect(pt.status).toBe('INSUFFICIENT_CADENCE');
      expect(pt.interpolationUsed).toBe(false);
    });
  });

  describe('J) canonical telemetry input is never rewritten', () => {
    (hasTelemetry ? it : it.skip)('load is read-only and SHA-verified', () => {
      const content = fs.readFileSync(TELEMETRY_JSONL, 'utf8');
      const rows1 = loadCanonicalTelemetryJsonl(TELEMETRY_JSONL);
      const rows2 = loadCanonicalTelemetryJsonl(TELEMETRY_JSONL);
      expect(rows1.length).toBe(5010);
      expect(rows2).toEqual(rows1);
      expect(crypto.createHash('sha256').update(content).digest('hex')).toBe(
        CANONICAL_TELEMETRY_JSONL_SHA256,
      );
    });
  });

  describe('K) derived interpolation is explicitly labelled and bounded', () => {
    it('marks interpolation used within gap bound', () => {
      const series = [
        { utcMs: Date.parse('2026-09-02T19:00:00.000Z'), value: 10 },
        { utcMs: Date.parse('2026-09-02T19:00:02.000Z'), value: 20 },
      ];
      const pt = deriveTelemetryAtUtc(series, Date.parse('2026-09-02T19:00:01.000Z'), 5);
      expect(pt.interpolationUsed).toBe(true);
      expect(pt.status).toBe('MATCHED');
      expect(pt.gapSeconds).toBe(2);
    });
  });

  describe('L) ActualGear sparse cadence cannot validate shift timing', () => {
    it('GEAR_CHANGE_TIMING_VALIDATED stays NO with sparse gear rows', () => {
      const telemetry = [
        ...syntheticSpeedTelemetry('2026-09-02T19:00:00.000Z', [40, 50, 60]),
        makeTelemetryRow({
          providerField: 'powertrainTransmissionActualGear',
          acquisitionSurface: 'LATEST_SLOW',
          providerTimestamp: '2026-09-02T19:00:00.000Z',
          synqReceivedAt: '2026-09-02T19:00:00.000Z',
          rawValueJson: 2,
        }),
      ];
      const clip = makeClip({
        observations: [
          {
            observationId: 's1',
            videoTimeSeconds: 0,
            videoTimeUncertaintySeconds: 0.1,
            observationType: 'SPEED',
            value: 40,
            unit: 'km/h',
            valueUncertainty: 1,
            confidence: 'VALIDATED',
            evidenceClass: 'DIRECT_VISUAL',
            sourceMethod: 'TEST_FIXTURE',
            notes: null,
          },
          {
            observationId: 's2',
            videoTimeSeconds: 5,
            videoTimeUncertaintySeconds: 0.1,
            observationType: 'SPEED',
            value: 60,
            unit: 'km/h',
            valueUncertainty: 1,
            confidence: 'VALIDATED',
            evidenceClass: 'DIRECT_VISUAL',
            sourceMethod: 'TEST_FIXTURE',
            notes: null,
          },
          {
            observationId: 'shift1',
            videoTimeSeconds: 9.5,
            videoTimeUncertaintySeconds: 0.1,
            observationType: 'SHIFT_TRANSITION',
            value: 'S2→S3',
            unit: null,
            valueUncertainty: null,
            confidence: 'EXTERNALLY_OBSERVED',
            evidenceClass: 'DIRECT_VISUAL',
            sourceMethod: 'TEST_FIXTURE',
            notes: 'IMG_2810-like',
          },
        ],
        candidateAbsoluteTime: {
          candidateStartUtc: '2026-09-02T19:00:00.000Z',
          uncertaintySeconds: 5,
          status: 'CANDIDATE',
        },
      });
      const result = alignClip({ clip, telemetryRows: telemetry });
      expect(result.gearTiming.GEAR_STATE_OBSERVED).toBe('YES');
      expect(result.gearTiming.GEAR_CHANGE_TIMING_VALIDATED).toBe('NO');
    });
  });

  describe('M) stable cruise can align without dynamic event', () => {
    it('negative-control stable cruise does not require acceleration event', () => {
      const telemetry = syntheticSpeedTelemetry(
        '2026-09-02T19:06:00.000Z',
        [65, 65, 65, 65, 65, 65],
      );
      const clip = makeClip({
        negativeControl: true,
        behavioralSummary: 'STABLE_CRUISE',
        candidateAbsoluteTime: {
          candidateStartUtc: '2026-09-02T19:06:00.000Z',
          uncertaintySeconds: 5,
          status: 'CANDIDATE',
        },
        observations: [
          {
            observationId: 'c1',
            videoTimeSeconds: 0,
            videoTimeUncertaintySeconds: 0.1,
            observationType: 'SPEED',
            value: 65,
            unit: 'km/h',
            valueUncertainty: 1,
            confidence: 'VALIDATED',
            evidenceClass: 'DIRECT_VISUAL',
            sourceMethod: 'TEST_FIXTURE',
            notes: null,
          },
          {
            observationId: 'c2',
            videoTimeSeconds: 3,
            videoTimeUncertaintySeconds: 0.1,
            observationType: 'SPEED',
            value: 65,
            unit: 'km/h',
            valueUncertainty: 1,
            confidence: 'VALIDATED',
            evidenceClass: 'DIRECT_VISUAL',
            sourceMethod: 'TEST_FIXTURE',
            notes: null,
          },
        ],
      });
      const result = alignClip({ clip, telemetryRows: telemetry });
      expect(result.metrics.EPISODE_DETECTABILITY).toBe('NEGATIVE_CONTROL');
      expect(result.alignmentStatus).not.toBe('VALIDATED');
    });
  });

  describe('N) unsigned speed cannot establish reverse direction', () => {
    it('direction not inferred from unsigned speed alone', () => {
      const clip = makeClip({
        behavioralSummary: 'REVERSE segment',
        observations: [
          {
            observationId: 'r1',
            videoTimeSeconds: 10,
            videoTimeUncertaintySeconds: 0.1,
            observationType: 'REVERSE_MOTION',
            value: 3,
            unit: 'km/h',
            valueUncertainty: 1,
            confidence: 'EXTERNALLY_OBSERVED',
            evidenceClass: 'DIRECT_VISUAL',
            sourceMethod: 'TEST_FIXTURE',
            notes: 'IMG_2811-like',
          },
        ],
      });
      const telemetry = syntheticSpeedTelemetry('2026-09-02T19:24:30.000Z', [3, 3, 0, 0]);
      const result = alignClip({ clip, telemetryRows: telemetry });
      expect(result.alignmentStatus).not.toBe('VALIDATED');
      expect(JSON.stringify(result)).not.toContain('signedSpeed');
    });
  });

  describe('O) deterministic alignment output', () => {
    (hasTelemetry && hasExternalGt ? it : it.skip)('same inputs → same output SHA', () => {
      const telemetry = loadCanonicalTelemetryJsonl(TELEMETRY_JSONL);
      const externalGt = JSON.parse(fs.readFileSync(EXTERNAL_GT, 'utf8')) as ExternalGtDocument;
      const r1 = runAlignmentWorkbench({ telemetryRows: telemetry, externalGt });
      const r2 = runAlignmentWorkbench({ telemetryRows: telemetry, externalGt });
      const sha1 = alignmentOutputSha256(r1);
      const sha2 = alignmentOutputSha256(r2);
      expect(sha1).toBe(sha2);
      expect(stableStringify(r1.clipAlignments)).toBe(stableStringify(r2.clipAlignments));
    });
  });

  describe('P) stale-provider fixture detects repeated identity', () => {
    it('detects stale hold when same provider identity re-acquired', () => {
      const rows = [
        makeTelemetryRow({
          providerField: 'speed',
          acquisitionSurface: 'LATEST_LIVE',
          providerTimestamp: '2026-09-02T19:00:00.000Z',
          synqReceivedAt: '2026-09-02T19:00:01.000Z',
          physicalSampleFingerprint: 'same-fp',
          rawValueJson: 60,
        }),
        makeTelemetryRow({
          providerField: 'speed',
          acquisitionSurface: 'LATEST_LIVE',
          providerTimestamp: '2026-09-02T19:00:00.000Z',
          synqReceivedAt: '2026-09-02T19:00:06.000Z',
          physicalSampleFingerprint: 'same-fp',
          rawValueJson: 60,
        }),
      ];
      const holds = detectStaleHolds(rows);
      expect(holds.length).toBe(1);
      expect(holds[0]!.staleHoldAcquisitionCount).toBe(2);
      expect(holds[0]!.staleHoldDurationSeconds).toBe(5);
    });
  });

  describe('Q) candidate metadata cannot become VALIDATED Ground Truth', () => {
    (hasExternalGt ? it : it.skip)('external GT file has empty observations and pending status', () => {
      const doc = JSON.parse(fs.readFileSync(EXTERNAL_GT, 'utf8')) as ExternalGtDocument;
      expect(doc.clips.length).toBe(9);
      for (const clip of doc.clips) {
        expect(clip.observations).toEqual([]);
        expect(clip.evidenceStatus).toBe('PENDING_EXTERNAL_REVIEW');
        expect(clip.candidateAbsoluteTime?.status).toBe(
          'CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY',
        );
      }
    });
  });
});
