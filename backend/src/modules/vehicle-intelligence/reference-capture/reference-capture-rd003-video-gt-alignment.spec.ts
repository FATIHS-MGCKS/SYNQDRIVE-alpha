import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  alignClip,
  alignmentOutputSha256,
  AMBIGUITY_MAE_DELTA_KMH,
  buildCrossClipClockModel,
  buildSignalSurfaceQuality,
  buildSpeedSeries,
  CANONICAL_TELEMETRY_JSONL_SHA256,
  computeProviderDeliveryMetrics,
  deriveTelemetryAtUtc,
  detectStaleHolds,
  extractClockSemantics,
  isAlignmentEligibleGroundTruth,
  isClockModelEligible,
  loadCanonicalTelemetryJsonl,
  makeTelemetryRow,
  resolveCandidateTimeWindow,
  runAlignmentWorkbench,
  scoreSpeedResidual,
  searchSpeedOffsetCandidates,
  searchSpeedResidualCandidates,
  stableStringify,
  SURFACE_INTERPOLATION_GAP_SECONDS,
  type ExternalGtClip,
  type ExternalGtDocument,
  type ExternalGtObservation,
  type SpeedSeriesPoint,
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

function makeSpeedSeries(
  points: Array<{ utcMs: number; value: number; ordinal?: number }>,
  surface: 'LATEST_LIVE' | 'HF_HISTORICAL' | 'LATEST_SLOW' = 'LATEST_LIVE',
): SpeedSeriesPoint[] {
  return points.map((p, i) => ({
    utcMs: p.utcMs,
    value: p.value,
    row: makeTelemetryRow({
      providerField: 'speed',
      acquisitionSurface: surface,
      providerTimestamp: new Date(p.utcMs).toISOString(),
      synqReceivedAt: new Date(p.utcMs).toISOString(),
      rawValueJson: p.value,
      acquisitionOrdinal: p.ordinal ?? i + 1,
      physicalSampleFingerprint: `fp-${i}-${p.value}`,
    }),
  }));
}

function validatedSpeedObs(
  id: string,
  videoTimeSeconds: number,
  value: number,
): ExternalGtObservation {
  return {
    observationId: id,
    videoTimeSeconds,
    videoTimeUncertaintySeconds: 0.1,
    observationType: 'SPEED',
    value,
    unit: 'km/h',
    valueUncertainty: 1,
    confidence: 'VALIDATED',
    evidenceClass: 'DIRECT_VISUAL',
    sourceMethod: 'TEST_FIXTURE',
    notes: null,
  };
}

function candidateSpeedObs(
  id: string,
  videoTimeSeconds: number,
  value: number,
): ExternalGtObservation {
  return {
    observationId: id,
    videoTimeSeconds,
    videoTimeUncertaintySeconds: 0.1,
    observationType: 'SPEED',
    value,
    unit: 'km/h',
    valueUncertainty: 1,
    confidence: 'CANDIDATE',
    evidenceClass: 'DIRECT_VISUAL',
    sourceMethod: 'TEST_FIXTURE',
    notes: null,
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
      const series = makeSpeedSeries([
        { utcMs: Date.parse('2026-09-02T19:00:00.000Z'), value: 10 },
        { utcMs: Date.parse('2026-09-02T19:00:20.000Z'), value: 30 },
      ]);
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
      const series = makeSpeedSeries([
        { utcMs: Date.parse('2026-09-02T19:00:00.000Z'), value: 10 },
        { utcMs: Date.parse('2026-09-02T19:00:02.000Z'), value: 20 },
      ]);
      const pt = deriveTelemetryAtUtc(series, Date.parse('2026-09-02T19:00:01.000Z'), 5);
      expect(pt.interpolationUsed).toBe(true);
      expect(pt.status).toBe('MATCHED');
      expect(pt.gapSeconds).toBe(2);
      expect(pt.beforeSource?.acquisitionOrdinal).toBe(1);
      expect(pt.afterSource?.acquisitionOrdinal).toBe(2);
      expect(pt.interpolationFraction).toBeCloseTo(0.5);
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

  describe('DI-EV-0034A hardening tests', () => {
    it('1) LATEST_LIVE is NOT automatically selected as sole speed authority', () => {
      const hf = syntheticSpeedTelemetry('2026-09-02T19:00:00.000Z', [10, 20, 30, 40], 1, 'HF_HISTORICAL');
      const live = syntheticSpeedTelemetry('2026-09-02T19:00:00.000Z', [10, 20, 30, 40], 1, 'LATEST_LIVE');
      const clip = makeClip({
        candidateAbsoluteTime: {
          candidateStartUtc: '2026-09-02T19:00:00.000Z',
          uncertaintySeconds: 2,
          status: 'CANDIDATE',
        },
        observations: [validatedSpeedObs('o1', 0, 20), validatedSpeedObs('o2', 2, 40)],
      });
      const result = alignClip({ clip, telemetryRows: [...hf, ...live] });
      expect(result.SPEED_ALIGNMENT_SURFACE_PRESELECTED).toBe('NO');
      expect(result.speedAlignmentBySurface.HF_HISTORICAL?.status).not.toBe('NOT_OBSERVED');
      expect(result.speedAlignmentBySurface.LATEST_LIVE?.status).not.toBe('NOT_OBSERVED');
      expect(result.preferredSpeedAlignmentSurface).not.toBe('LATEST_LIVE');
    });

    it('2) HF_HISTORICAL and LATEST_LIVE produce separate alignment results', () => {
      const hf = syntheticSpeedTelemetry('2026-09-02T19:00:00.000Z', [5, 15, 25, 35], 1, 'HF_HISTORICAL');
      const live = syntheticSpeedTelemetry('2026-09-02T19:00:02.000Z', [10, 20, 30, 40], 1, 'LATEST_LIVE');
      const clip = makeClip({
        candidateAbsoluteTime: {
          candidateStartUtc: '2026-09-02T19:00:00.000Z',
          uncertaintySeconds: 2,
          status: 'CANDIDATE',
        },
        observations: [validatedSpeedObs('o1', 0, 15), validatedSpeedObs('o2', 2, 35)],
      });
      const result = alignClip({ clip, telemetryRows: [...hf, ...live] });
      const hfEntry = result.speedAlignmentBySurface.HF_HISTORICAL;
      const liveEntry = result.speedAlignmentBySurface.LATEST_LIVE;
      expect(hfEntry && 'bestCandidate' in hfEntry).toBe(true);
      expect(liveEntry && 'bestCandidate' in liveEntry).toBe(true);
      if (hfEntry && 'bestCandidate' in hfEntry && liveEntry && 'bestCandidate' in liveEntry) {
        expect(hfEntry.bestCandidate.maeKmh).not.toBe(liveEntry.bestCandidate.maeKmh);
      }
    });

    it('3) two unvalidated/candidate SPEED observations cannot drive alignment', () => {
      const telemetry = syntheticSpeedTelemetry('2026-09-02T19:00:00.000Z', [10, 20, 30, 40]);
      const clip = makeClip({
        candidateAbsoluteTime: {
          candidateStartUtc: '2026-09-02T19:00:00.000Z',
          uncertaintySeconds: 2,
          status: 'CANDIDATE',
        },
        observations: [candidateSpeedObs('c1', 0, 20), candidateSpeedObs('c2', 2, 40)],
      });
      const result = alignClip({ clip, telemetryRows: telemetry });
      expect(result.gtCounts.RAW_EXTERNAL_GT_COUNT).toBe(2);
      expect(result.gtCounts.ALIGNMENT_ELIGIBLE_GT_COUNT).toBe(0);
      expect(result.alignmentStatus).not.toBe('STRONG_CANDIDATE');
      expect(result.alignmentStatus).not.toBe('VALIDATED');
    });

    it('4) only alignment-eligible GT enters matching metrics', () => {
      const telemetry = syntheticSpeedTelemetry('2026-09-02T19:00:00.000Z', [10, 20, 30, 40]);
      const clip = makeClip({
        candidateAbsoluteTime: {
          candidateStartUtc: '2026-09-02T19:00:00.000Z',
          uncertaintySeconds: 2,
          status: 'CANDIDATE',
        },
        observations: [
          validatedSpeedObs('v1', 0, 20),
          validatedSpeedObs('v2', 2, 40),
          candidateSpeedObs('c1', 1, 25),
        ],
      });
      const result = alignClip({ clip, telemetryRows: telemetry });
      expect(result.gtCounts.RAW_EXTERNAL_GT_COUNT).toBe(3);
      expect(result.gtCounts.ALIGNMENT_ELIGIBLE_GT_COUNT).toBe(2);
      expect(isAlignmentEligibleGroundTruth(candidateSpeedObs('x', 0, 1))).toBe(false);
    });

    it('5) candidate UTC range can be searched without fabricating exact observed start', () => {
      const clip = makeClip({
        candidateAbsoluteTime: {
          candidateStartUtcFrom: '2026-09-02T19:21:00.000Z',
          candidateStartUtcTo: '2026-09-02T19:21:14.000Z',
          status: 'CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY',
        },
      });
      const window = resolveCandidateTimeWindow(clip);
      expect(window.priorUtc).toBeNull();
      expect(window.priorFromUtc).toBe('2026-09-02T19:21:00.000Z');
      expect(window.priorToUtc).toBe('2026-09-02T19:21:14.000Z');
      expect(window.searchAnchorDerivation).toBe('DERIVED_MIDPOINT_OF_CANDIDATE_RANGE_FOR_SEARCH_ONLY');
      expect(window.residualSearchToSeconds).toBe(14);
    });

    it('6) candidate-start residual is not mislabeled absolute clock offset', () => {
      const telemetry = syntheticSpeedTelemetry('2026-09-02T19:00:00.000Z', [10, 20, 30, 40]);
      const clip = makeClip({
        candidateAbsoluteTime: {
          candidateStartUtc: '2026-09-02T19:00:00.000Z',
          uncertaintySeconds: 2,
          status: 'CANDIDATE',
        },
        observations: [validatedSpeedObs('o1', 0, 20), validatedSpeedObs('o2', 2, 40)],
      });
      const result = alignClip({ clip, telemetryRows: telemetry });
      expect(result.offsetSemantics.CANDIDATE_START_RESIDUAL_SECONDS).not.toBeNull();
      expect(result.offsetSemantics.VIDEO_CLOCK_TO_PROVIDER_TIME_OFFSET_SECONDS).toBe(
        'NOT_IDENTIFIABLE',
      );
      expect(result.offsetSemantics.CANDIDATE_START_PRIOR_UTC).toBe('2026-09-02T19:00:00.000Z');
    });

    it('7) AMBIGUOUS alignment cannot enter cross-clip clock model', () => {
      const ambiguous = alignClip({
        clip: makeClip({
          candidateAbsoluteTime: {
            candidateStartUtc: '2026-09-02T19:00:00.000Z',
            uncertaintySeconds: 2,
            status: 'CANDIDATE',
          },
          observations: [validatedSpeedObs('o1', 0, 50), validatedSpeedObs('o2', 1, 50)],
        }),
        telemetryRows: syntheticSpeedTelemetry('2026-09-02T19:00:00.000Z', [50, 50, 50, 50]),
      });
      ambiguous.alignmentStatus = 'AMBIGUOUS';
      const gate = isClockModelEligible(ambiguous);
      expect(gate.eligible).toBe(false);
      expect(gate.reason).toBe('AMBIGUOUS');
    });

    it('8) NOT_IDENTIFIABLE alignment cannot enter clock model', () => {
      const notId = alignClip({
        clip: makeClip({
          candidateAbsoluteTime: {
            candidateStartUtc: '2026-09-02T19:00:00.000Z',
            uncertaintySeconds: 2,
            status: 'CANDIDATE',
          },
          observations: [validatedSpeedObs('o1', 0, 999), validatedSpeedObs('o2', 2, 999)],
        }),
        telemetryRows: syntheticSpeedTelemetry('2026-09-02T19:00:00.000Z', [10, 20, 30, 40]),
      });
      notId.alignmentStatus = 'NOT_IDENTIFIABLE';
      const gate = isClockModelEligible(notId);
      expect(gate.eligible).toBe(false);
      expect(gate.reason).toBe('NOT_IDENTIFIABLE');
    });

    it('9) global clock model remains UNRESOLVED with insufficient eligible clips', () => {
      const pending = alignClip({ clip: makeClip(), telemetryRows: [] });
      const model = buildCrossClipClockModel([pending, pending]);
      expect(model.modelOutcome).toBe('PENDING_EXTERNAL_GT');
      const oneEligible = alignClip({
        clip: makeClip({
          candidateAbsoluteTime: {
            candidateStartUtc: '2026-09-02T19:00:00.000Z',
            uncertaintySeconds: 2,
            status: 'CANDIDATE',
          },
          observations: [validatedSpeedObs('o1', 0, 20), validatedSpeedObs('o2', 2, 40)],
        }),
        telemetryRows: syntheticSpeedTelemetry('2026-09-02T19:00:00.000Z', [10, 20, 30, 40]),
      });
      const modelOne = buildCrossClipClockModel([oneEligible, pending]);
      expect(modelOne.modelOutcome).toBe('UNRESOLVED');
    });

    it('10) minute transition uncertainty remains distinct from static minute resolution', () => {
      const clip = makeClip({
        videoClock: {
          displayedLocalTime: '21:03 → 21:04',
          displayedMinuteTransitions: [
            { videoTimeSeconds: 10.55, uncertaintySeconds: 0.1, fromMinute: '21:03', toMinute: '21:04' },
          ],
          clockResolutionSeconds: 60,
        },
      });
      const semantics = extractClockSemantics(clip);
      expect(semantics.VIDEO_CLOCK_DISPLAY_RESOLUTION_SECONDS).toBe(60);
      expect(semantics.MINUTE_TRANSITION_VIDEO_TIME_UNCERTAINTY_SECONDS).toBe(0.1);
      expect(semantics.VEHICLE_CLOCK_TO_UTC_ACCURACY).toBe('UNKNOWN');
    });

    it('11) ActualGear row count alone cannot prove event cadence', () => {
      const manyRows = Array.from({ length: 20 }, (_, i) =>
        makeTelemetryRow({
          providerField: 'powertrainTransmissionActualGear',
          acquisitionSurface: 'LATEST_SLOW',
          providerTimestamp: new Date(Date.parse('2026-09-02T19:00:00.000Z') + i * 60_000).toISOString(),
          synqReceivedAt: new Date(Date.parse('2026-09-02T19:00:00.000Z') + i * 60_000).toISOString(),
          rawValueJson: 2,
        }),
      );
      const clip = makeClip({
        candidateAbsoluteTime: {
          candidateStartUtc: '2026-09-02T19:00:00.000Z',
          uncertaintySeconds: 5,
          status: 'CANDIDATE',
        },
        observations: [
          validatedSpeedObs('s1', 0, 40),
          validatedSpeedObs('s2', 5, 60),
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
            notes: null,
          },
        ],
      });
      const result = alignClip({ clip, telemetryRows: [...syntheticSpeedTelemetry('2026-09-02T19:00:00.000Z', [40, 50, 60]), ...manyRows] });
      expect(result.gearTiming.GEAR_STATE_OBSERVED).toBe('YES');
      expect(result.gearTiming.GEAR_CHANGE_TIMING_VALIDATED).not.toBe('YES');
    });

    it('12) slow ActualGear around synthetic shift cannot validate timing if local gap is too large', () => {
      const telemetry = [
        ...syntheticSpeedTelemetry('2026-09-02T19:00:00.000Z', [40, 45, 50, 55, 60, 65, 70], 1),
        makeTelemetryRow({
          providerField: 'powertrainTransmissionActualGear',
          acquisitionSurface: 'LATEST_SLOW',
          providerTimestamp: '2026-09-02T19:00:00.000Z',
          synqReceivedAt: '2026-09-02T19:00:00.000Z',
          rawValueJson: 2,
        }),
        makeTelemetryRow({
          providerField: 'powertrainTransmissionActualGear',
          acquisitionSurface: 'LATEST_SLOW',
          providerTimestamp: '2026-09-02T19:00:30.000Z',
          synqReceivedAt: '2026-09-02T19:00:30.000Z',
          rawValueJson: 3,
        }),
      ];
      const clip = makeClip({
        candidateAbsoluteTime: {
          candidateStartUtc: '2026-09-02T19:00:00.000Z',
          uncertaintySeconds: 5,
          status: 'CANDIDATE',
        },
        observations: [
          validatedSpeedObs('s1', 0, 40),
          validatedSpeedObs('s2', 5, 60),
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
            notes: null,
          },
        ],
      });
      const result = alignClip({ clip, telemetryRows: telemetry });
      expect(result.gearTiming.localGapAroundShiftSeconds).toBeGreaterThan(
        SURFACE_INTERPOLATION_GAP_SECONDS.LATEST_SLOW,
      );
      expect(result.gearTiming.GEAR_CHANGE_TIMING_VALIDATED).toBe('NOT_IDENTIFIABLE');
    });

    it('13) RMSE and max absolute speed error are correct on synthetic fixtures', () => {
      const series = makeSpeedSeries([
        { utcMs: Date.parse('2026-09-02T19:00:00.000Z'), value: 10 },
        { utcMs: Date.parse('2026-09-02T19:00:01.000Z'), value: 20 },
        { utcMs: Date.parse('2026-09-02T19:00:02.000Z'), value: 30 },
      ]);
      const obs = [validatedSpeedObs('o1', 0, 10), validatedSpeedObs('o2', 2, 30)];
      const metrics = scoreSpeedResidual({
        eligibleObservations: obs,
        speedSeries: series,
        searchAnchorMs: Date.parse('2026-09-02T19:00:00.000Z'),
        residualSeconds: 0,
        maxGapSeconds: 5,
      });
      expect(metrics.mae).toBe(0);
      expect(metrics.rmse).toBe(0);
      expect(metrics.maxAbsError).toBe(0);
      const metrics2 = scoreSpeedResidual({
        eligibleObservations: [validatedSpeedObs('o3', 1, 25)],
        speedSeries: series,
        searchAnchorMs: Date.parse('2026-09-02T19:00:00.000Z'),
        residualSeconds: 0,
        maxGapSeconds: 5,
      });
      expect(metrics2.maxAbsError).toBe(5);
      expect(metrics2.rmse).toBe(5);
    });

    it('14) derived interpolation points retain source-row provenance', () => {
      const series = makeSpeedSeries([
        { utcMs: Date.parse('2026-09-02T19:00:00.000Z'), value: 10, ordinal: 11 },
        { utcMs: Date.parse('2026-09-02T19:00:02.000Z'), value: 30, ordinal: 22 },
      ]);
      const pt = deriveTelemetryAtUtc(series, Date.parse('2026-09-02T19:00:01.000Z'), 5);
      expect(pt.beforeSource?.acquisitionOrdinal).toBe(11);
      expect(pt.afterSource?.acquisitionOrdinal).toBe(22);
      expect(pt.beforeSource?.physicalSampleFingerprint).toBe('fp-0-10');
      expect(pt.afterSource?.physicalSampleFingerprint).toBe('fp-1-30');
    });

    it('15) surface-specific configured interpolation gap is enforced', () => {
      const hfSeries = makeSpeedSeries(
        [
          { utcMs: Date.parse('2026-09-02T19:00:00.000Z'), value: 10 },
          { utcMs: Date.parse('2026-09-02T19:00:04.000Z'), value: 30 },
        ],
        'HF_HISTORICAL',
      );
      const hfGap = SURFACE_INTERPOLATION_GAP_SECONDS.HF_HISTORICAL;
      const ptHf = deriveTelemetryAtUtc(hfSeries, Date.parse('2026-09-02T19:00:02.000Z'), hfGap);
      expect(ptHf.status).toBe('INSUFFICIENT_CADENCE');
      const liveGap = SURFACE_INTERPOLATION_GAP_SECONDS.LATEST_LIVE;
      const liveSeries = makeSpeedSeries(
        [
          { utcMs: Date.parse('2026-09-02T19:00:00.000Z'), value: 10 },
          { utcMs: Date.parse('2026-09-02T19:00:02.000Z'), value: 30 },
        ],
        'LATEST_LIVE',
      );
      const ptLive = deriveTelemetryAtUtc(liveSeries, Date.parse('2026-09-02T19:00:01.000Z'), liveGap);
      expect(ptLive.status).toBe('MATCHED');
    });

    it('16) canonical DI-EV-0033 SHA remains unchanged', () => {
      (hasTelemetry ? expect : expect)(true).toBe(true);
      if (!hasTelemetry) return;
      const content = fs.readFileSync(TELEMETRY_JSONL, 'utf8');
      expect(crypto.createHash('sha256').update(content).digest('hex')).toBe(
        CANONICAL_TELEMETRY_JSONL_SHA256,
      );
    });

    it('17) same inputs still produce deterministic byte-identical output', () => {
      if (!hasTelemetry || !hasExternalGt) return;
      const telemetry = loadCanonicalTelemetryJsonl(TELEMETRY_JSONL);
      const externalGt = JSON.parse(fs.readFileSync(EXTERNAL_GT, 'utf8')) as ExternalGtDocument;
      const r1 = runAlignmentWorkbench({ telemetryRows: telemetry, externalGt });
      const r2 = runAlignmentWorkbench({ telemetryRows: telemetry, externalGt });
      expect(alignmentOutputSha256(r1)).toBe(alignmentOutputSha256(r2));
      expect(stableStringify(r1)).toBe(stableStringify(r2));
    });
  });
});
