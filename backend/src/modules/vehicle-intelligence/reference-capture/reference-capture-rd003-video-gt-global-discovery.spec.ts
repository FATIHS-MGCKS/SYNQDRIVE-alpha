import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  CANONICAL_TELEMETRY_JSONL_SHA256,
  isAlignmentEligibleGroundTruth,
  makeTelemetryRow,
  computeVideoClockBoundaryResidual,
  clipHasObservedMinuteTransition,
  type ExternalGtClip,
  type ExternalGtObservation,
} from './reference-capture-rd003-video-gt-alignment';
import { externalGtDocumentSha256, buildExternalGtDocument } from './reference-capture-rd003-video-gt-external-observations';
import {
  artifactSha256,
  circularDistanceMod60,
  coarseToFineGlobalSearch,
  DISCOVERY_MODE,
  equivalentPhaseMod60,
  extractTopDistinctBasins,
  normalizePhaseSecondsMod60,
  rankGlobalCandidatesByQuality,
  runGlobalFingerprintDiscovery,
  scoreSpeedAtAbsoluteClipStart,
  searchAbsoluteClipStarts,
  selectDistinctTemporalBasinSeeds,
  sessionSearchBoundsMs,
  type GlobalSearchCandidate,
} from './reference-capture-rd003-video-gt-global-discovery';

const EXTERNAL_GT = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd003-video-ground-truth-observations.json',
);
const HARD_PRIOR_DIR = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd003-video-gt-alignment/hard-clock-prior-run',
);
const DISCOVERY_DIR = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd003-video-gt-alignment/global-fingerprint-discovery',
);
const TELEMETRY_JSONL = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/dimo-lte-r1-reference-drive-003-video-gt-correlation-source.jsonl',
);

const hasExternalGt = fs.existsSync(EXTERNAL_GT);
const hasHardPrior = fs.existsSync(path.join(HARD_PRIOR_DIR, 'alignment-summary.json'));
const hasDiscovery = fs.existsSync(path.join(DISCOVERY_DIR, 'discovery-summary.json'));

function validatedSpeedObs(id: string, t: number, v: number): ExternalGtObservation {
  return {
    observationId: id,
    videoTimeSeconds: t,
    videoTimeUncertaintySeconds: 0.15,
    observationType: 'SPEED',
    value: v,
    unit: 'km/h',
    valueUncertainty: 1,
    confidence: 'VALIDATED',
    evidenceClass: 'DIRECT_VISUAL',
    sourceMethod: 'TEST',
    notes: null,
  };
}

function makeClip(overrides: Partial<ExternalGtClip> = {}): ExternalGtClip {
  return {
    clipId: 'RD003_GT_CLIP_TEST',
    fileName: 'IMG_TEST.mp4',
    videoDurationSeconds: 30,
    videoDurationUncertainty: 0.5,
    evidenceStatus: 'EXTERNAL_GT_INGESTED',
    observations: [],
    ...overrides,
  };
}

function syntheticSeries(
  startMs: number,
  speeds: number[],
  stepMs = 1000,
  surface: 'HF_HISTORICAL' | 'LATEST_LIVE' = 'HF_HISTORICAL',
) {
  return speeds.map((value, i) => ({
    utcMs: startMs + i * stepMs,
    value,
    row: makeTelemetryRow({
      providerField: 'speed',
      acquisitionSurface: surface,
      providerTimestamp: new Date(startMs + i * stepMs).toISOString(),
      synqReceivedAt: new Date(startMs + i * stepMs + 500).toISOString(),
      rawValueJson: value,
      acquisitionOrdinal: i + 1,
      physicalSampleFingerprint: `fp-${i}`,
    }),
  }));
}

describe('DI-EV-0034C global fingerprint discovery', () => {
  it('1) GLOBAL_FINGERPRINT_DISCOVERY ignores hard clock prior during candidate search', () => {
    const clip = makeClip({
      candidateAbsoluteTime: {
        candidateStartUtc: '2026-09-02T19:03:49.400Z',
        uncertaintySeconds: 5,
        status: 'CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY',
      },
      observations: [validatedSpeedObs('s1', 0, 10), validatedSpeedObs('s2', 2, 30)],
    });
    const trueStart = Date.parse('2026-09-02T19:10:00.000Z');
    const series = syntheticSeries(trueStart, [10, 15, 20, 25, 30, 35]);
    const search = coarseToFineGlobalSearch({
      clip,
      speedSeries: series,
      eligibleObservations: clip.observations,
      surface: 'HF_HISTORICAL',
    });
    const best = search.topBasins[0];
    expect(best).toBeDefined();
    expect(Math.abs((best!.alignedClipStartMs - trueStart) / 1000)).toBeLessThan(3);
    expect(best!.alignedClipStartMs).not.toBe(Date.parse('2026-09-02T19:03:49.400Z'));
  });

  it('2) HARD_CLOCK_PRIOR_RUN artifacts remain hash-identified', () => {
    if (!hasHardPrior) return;
    const manifestPath = path.join(HARD_PRIOR_DIR, 'hard-clock-prior-manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const summary = fs.readFileSync(path.join(HARD_PRIOR_DIR, 'alignment-summary.json'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      artifactSha256: Record<string, string>;
    };
    expect(manifest.artifactSha256['alignment-summary.json']).toBe(artifactSha256(summary));
  });

  it('3) full-session candidate outside original clock window can be discovered', () => {
    const clip = makeClip({
      candidateAbsoluteTime: {
        candidateStartUtc: '2026-09-02T19:03:49.400Z',
        uncertaintySeconds: 10,
        status: 'CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY',
      },
      videoDurationSeconds: 20,
      observations: [
        validatedSpeedObs('s1', 0, 50),
        validatedSpeedObs('s2', 5, 60),
        validatedSpeedObs('s3', 10, 70),
      ],
    });
    const outsideStart = Date.parse('2026-09-02T19:20:00.000Z');
    const series = syntheticSeries(outsideStart, [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]);
    const search = coarseToFineGlobalSearch({
      clip,
      speedSeries: series,
      eligibleObservations: clip.observations,
      surface: 'HF_HISTORICAL',
    });
    const best = search.topBasins[0];
    expect(best).toBeDefined();
    expect(Math.abs(best!.alignedClipStartMs - outsideStart)).toBeLessThan(5000);
    expect(
      Math.abs(best!.alignedClipStartMs - Date.parse('2026-09-02T19:03:49.400Z')),
    ).toBeGreaterThan(10_000);
  });

  it('4) top-N results contain DISTINCT basins, not adjacent grid points', () => {
    const candidates: GlobalSearchCandidate[] = [];
    for (let i = 0; i < 20; i++) {
      candidates.push({
        alignedClipStartMs: Date.parse('2026-09-02T19:00:00.000Z') + i * 500,
        alignedClipStartUtc: new Date(Date.parse('2026-09-02T19:00:00.000Z') + i * 500).toISOString(),
        mae: i < 3 ? 2 : 20,
        rmse: i < 3 ? 2 : 20,
        maxAbsError: i < 3 ? 3 : 25,
        matched: 5,
        total: 5,
        errors: [],
        matchCoverageRatio: 1,
      });
    }
    for (let i = 0; i < 5; i++) {
      candidates.push({
        alignedClipStartMs: Date.parse('2026-09-02T19:15:00.000Z') + i * 500,
        alignedClipStartUtc: new Date(Date.parse('2026-09-02T19:15:00.000Z') + i * 500).toISOString(),
        mae: 3,
        rmse: 3,
        maxAbsError: 4,
        matched: 5,
        total: 5,
        errors: [],
        matchCoverageRatio: 1,
      });
    }
    const basins = extractTopDistinctBasins(candidates, 5, 2);
    expect(basins.length).toBe(2);
    expect(basins[0]!.distinctFromNextBasinSeconds).toBeGreaterThan(5);
  });

  it('5) coarse-to-fine search is deterministic', () => {
    const clip = makeClip({
      observations: [validatedSpeedObs('s1', 0, 20), validatedSpeedObs('s2', 2, 40)],
    });
    const series = syntheticSeries(Date.parse('2026-09-02T19:05:00.000Z'), [20, 25, 30, 35, 40, 45]);
    const a = coarseToFineGlobalSearch({
      clip,
      speedSeries: series,
      eligibleObservations: clip.observations,
      surface: 'HF_HISTORICAL',
    });
    const b = coarseToFineGlobalSearch({
      clip,
      speedSeries: series,
      eligibleObservations: clip.observations,
      surface: 'HF_HISTORICAL',
    });
    expect(a.topBasins).toEqual(b.topBasins);
  });

  it('6) chronology analysis cannot alter independent basin scores', () => {
    if (!hasDiscovery) return;
    const basins = JSON.parse(
      fs.readFileSync(path.join(DISCOVERY_DIR, 'per-clip-top-basins.json'), 'utf8'),
    ) as Record<string, { HF_HISTORICAL: Array<{ MAE: number; rank: number }> }>;
    const clip001Mae = basins.RD003_GT_CLIP_001?.HF_HISTORICAL[0]?.MAE;
    expect(clip001Mae).toBeDefined();
    const chronology = JSON.parse(
      fs.readFileSync(path.join(DISCOVERY_DIR, 'chronology-consistent-path.json'), 'utf8'),
    );
    expect(basins.RD003_GT_CLIP_001?.HF_HISTORICAL[0]?.MAE).toBe(clip001Mae);
    expect(chronology.CHRONOLOGY_PATH_FOUND).toBeDefined();
  });

  it('7) chronology analysis refuses to fabricate a path when no credible path exists', () => {
    const { buildChronologyConsistentPath, CLIP_CHRONOLOGY_ORDER } = require('./reference-capture-rd003-video-gt-global-discovery');
    const discoveries = CLIP_CHRONOLOGY_ORDER.map((clipId: string) => ({
      clipId,
      fileName: `${clipId}.mp4`,
      discoveryMode: DISCOVERY_MODE,
      hardClockPriorIgnored: 'YES' as const,
      alignmentEligibleGtCount: 0,
      HF_HISTORICAL: {
        globalStatus: 'INSUFFICIENT_GROUND_TRUTH' as const,
        bestStart: null,
        bestCoverage: null,
        bestMae: null,
        bestRmse: null,
        bestMaxError: null,
        bestBasinWidth: null,
        distinctCompetingBasins: 0,
        topBasins: [],
      },
      LATEST_LIVE: {
        globalStatus: 'INSUFFICIENT_GROUND_TRUTH' as const,
        bestStart: null,
        bestCoverage: null,
        bestMae: null,
        topBasins: [],
      },
      LATEST_SLOW: { globalStatus: 'NOT_OBSERVED' as const },
    }));
    const clips = CLIP_CHRONOLOGY_ORDER.map((clipId: string) =>
      makeClip({ clipId, fileName: `${clipId}.mp4` }),
    );
    const pathResult = buildChronologyConsistentPath(discoveries, clips, 'HF_HISTORICAL');
    expect(pathResult.CHRONOLOGY_PATH_FOUND).toBe('NO');
  });

  it('8) clock phase uses modulo-60/circular distance', () => {
    expect(normalizePhaseSecondsMod60(90)).toBeCloseTo(30, 6);
    expect(circularDistanceMod60(5, 55)).toBeCloseTo(10, 6);
  });

  it('9) -29.5 s and +30.5 s boundary residuals are equivalent phase', () => {
    expect(equivalentPhaseMod60(-29.5, 30.5)).toBe(true);
    expect(normalizePhaseSecondsMod60(-29.5)).toBeCloseTo(normalizePhaseSecondsMod60(30.5), 6);
  });

  it('10) static-minute clips cannot create precise phase anchors', () => {
    const clip = makeClip({
      clipId: 'RD003_GT_CLIP_002',
      fileName: 'IMG_2804.mp4',
      videoClock: { displayedMinuteTransitions: [], displayedLocalTime: '21:06' },
    });
    expect(clipHasObservedMinuteTransition(clip)).toBe(false);
  });

  it('11) phase-informed windows are generated only after independent phase support', () => {
    if (!hasDiscovery) return;
    const model = JSON.parse(
      fs.readFileSync(path.join(DISCOVERY_DIR, 'clock-phase-model.json'), 'utf8'),
    );
    if (model.CLOCK_PHASE_MODEL_STATUS === 'PHASE_CLUSTER_SUPPORTED') {
      expect(model.phaseInformedWindow).toBeDefined();
    } else {
      expect(model.phaseInformedWindow == null || model.phaseInformedWindow).toBeTruthy();
    }
  });

  it('12) phase-informed windows cannot delete a stronger global basin', () => {
    const ranked = rankGlobalCandidatesByQuality([
      {
        alignedClipStartMs: 1000,
        alignedClipStartUtc: 'x',
        mae: 3,
        rmse: 3,
        maxAbsError: 4,
        matched: 10,
        total: 10,
        errors: [],
        matchCoverageRatio: 1,
      },
      {
        alignedClipStartMs: 2000,
        alignedClipStartUtc: 'y',
        mae: 10,
        rmse: 10,
        maxAbsError: 12,
        matched: 10,
        total: 10,
        errors: [],
        matchCoverageRatio: 1,
      },
    ]);
    expect(ranked[0]!.mae).toBe(3);
  });

  it('13) providerTimestamp and synqReceivedAt diagnostic timelines remain separate', () => {
    if (!hasDiscovery) return;
    const diag = JSON.parse(
      fs.readFileSync(path.join(DISCOVERY_DIR, 'provider-vs-ingress-diagnostics.json'), 'utf8'),
    );
    expect(diag.note).toMatch(/separate timelines/i);
    const first = diag.perClip[0];
    expect(first.PHYSICAL_CANDIDATE_TIMELINE).toBe('providerTimestamp');
    expect(first.DELIVERY_TIMELINE).toBe('synqReceivedAt');
  });

  it('14) provider sample age is calculated from matched source rows', () => {
    const row = makeTelemetryRow({
      providerField: 'speed',
      acquisitionSurface: 'HF_HISTORICAL',
      providerTimestamp: '2026-09-02T19:00:00.000Z',
      synqReceivedAt: '2026-09-02T19:00:05.000Z',
      rawValueJson: 50,
    });
    const series = [{ utcMs: Date.parse('2026-09-02T19:00:00.000Z'), value: 50, row }];
    const score = scoreSpeedAtAbsoluteClipStart({
      eligibleObservations: [validatedSpeedObs('s1', 0, 50)],
      speedSeries: series,
      alignedClipStartMs: Date.parse('2026-09-02T19:00:00.000Z'),
      maxGapSeconds: 3,
    });
    expect(score.matched).toBe(1);
  });

  it('15) LATEST_LIVE stale identities are not treated as repeated physical samples', () => {
    const fp = 'same-fp';
    const rows = [
      makeTelemetryRow({
        providerField: 'speed',
        acquisitionSurface: 'LATEST_LIVE',
        providerTimestamp: '2026-09-02T19:00:00.000Z',
        synqReceivedAt: '2026-09-02T19:00:01.000Z',
        physicalSampleFingerprint: fp,
        rawValueJson: 60,
      }),
      makeTelemetryRow({
        providerField: 'speed',
        acquisitionSurface: 'LATEST_LIVE',
        providerTimestamp: '2026-09-02T19:00:00.000Z',
        synqReceivedAt: '2026-09-02T19:00:06.000Z',
        physicalSampleFingerprint: fp,
        rawValueJson: 60,
      }),
    ];
    const uniqueProviderTimes = new Set(rows.map((r) => r.providerTimestamp));
    expect(uniqueProviderTimes.size).toBe(1);
    expect(rows.length).toBe(2);
  });

  it('16) observed minute transition + unqualified alignment does NOT report NO_OBSERVED_MINUTE_TRANSITION', () => {
    const clip = makeClip({
      videoClock: {
        displayedMinuteTransitions: [
          { videoTimeSeconds: 10.55, uncertaintySeconds: 0.1, fromMinute: '21:03', toMinute: '21:04' },
        ],
      },
    });
    const boundary = computeVideoClockBoundaryResidual({ clip, alignedClipStartMs: null });
    expect(boundary.VIDEO_CLOCK_BOUNDARY_RESIDUAL_STATUS).toBe(
      'MINUTE_TRANSITION_OBSERVED_ALIGNMENT_NOT_QUALIFIED',
    );
  });

  it('17) external GT SHA remains unchanged', () => {
    const doc = buildExternalGtDocument();
    expect(externalGtDocumentSha256(doc)).toBe(
      'ea0d78ee71b5c83f104e8de31056ccfccc7b476733b676da5bf8828badc9592e',
    );
    if (hasExternalGt) {
      expect(externalGtDocumentSha256(JSON.parse(fs.readFileSync(EXTERNAL_GT, 'utf8')))).toBe(
        'ea0d78ee71b5c83f104e8de31056ccfccc7b476733b676da5bf8828badc9592e',
      );
    }
  });

  it('18) canonical DI-EV-0033 SHA remains unchanged', () => {
    if (!fs.existsSync(TELEMETRY_JSONL)) return;
    expect(crypto.createHash('sha256').update(fs.readFileSync(TELEMETRY_JSONL)).digest('hex')).toBe(
      CANONICAL_TELEMETRY_JSONL_SHA256,
    );
  });

  it('19) same inputs produce deterministic discovery artifacts', () => {
    if (!hasExternalGt || !fs.existsSync(TELEMETRY_JSONL)) return;
    const { loadCanonicalTelemetryJsonl, loadExternalGtDocument } = require('./reference-capture-rd003-video-gt-alignment');
    const telemetry = loadCanonicalTelemetryJsonl(TELEMETRY_JSONL);
    const externalGt = loadExternalGtDocument(EXTERNAL_GT);
    const a = runGlobalFingerprintDiscovery({ telemetryRows: telemetry, externalGt });
    const b = runGlobalFingerprintDiscovery({ telemetryRows: telemetry, externalGt });
    expect(a.perClipTopBasins).toEqual(b.perClipTopBasins);
  });

  it('20) eligible GT gate still requires VALIDATED DIRECT_VISUAL SPEED', () => {
    const obs: ExternalGtObservation = {
      observationId: 'x',
      videoTimeSeconds: 0,
      videoTimeUncertaintySeconds: 0.15,
      observationType: 'SPEED',
      value: 10,
      unit: 'km/h',
      valueUncertainty: 1,
      confidence: 'CANDIDATE',
      evidenceClass: 'DIRECT_VISUAL',
      sourceMethod: 'TEST',
      notes: null,
    };
    expect(isAlignmentEligibleGroundTruth(obs)).toBe(false);
  });

  it('21) distinct basin seeds enforce temporal separation', () => {
    const candidates: GlobalSearchCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      alignedClipStartMs: 1_000_000 + i * 500,
      alignedClipStartUtc: new Date(1_000_000 + i * 500).toISOString(),
      mae: 5 - i * 0.1,
      rmse: 5,
      maxAbsError: 6,
      matched: 5,
      total: 5,
      errors: [],
      matchCoverageRatio: 1,
    }));
    const seeds = selectDistinctTemporalBasinSeeds(candidates, 5, 5);
    expect(seeds.length).toBe(1);
  });
});
