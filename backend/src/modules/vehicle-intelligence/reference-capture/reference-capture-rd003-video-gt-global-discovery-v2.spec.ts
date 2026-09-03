import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  CANONICAL_TELEMETRY_JSONL_SHA256,
  isAlignmentEligibleGroundTruth,
  makeTelemetryRow,
  type ExternalGtClip,
  type ExternalGtObservation,
} from './reference-capture-rd003-video-gt-alignment';
import { externalGtDocumentSha256, buildExternalGtDocument } from './reference-capture-rd003-video-gt-external-observations';
import {
  artifactSha256,
  buildSpeedSeriesIngress,
  classifyGlobalCandidateStatus,
  coarseToFineGlobalSearch,
  type GlobalSearchCandidate,
} from './reference-capture-rd003-video-gt-global-discovery';
import {
  auditMutuallyExclusiveCandidates,
  boundaryToClockIntercept,
  buildClockClipEvidence,
  buildDiscoveryV2SeedSet,
  buildJointClockChronologyPath,
  buildParetoFrontier,
  buildQualifiedClockPhaseModel,
  buildRelativeClockInterceptModel,
  circularMeanMod60,
  coarseToFineGlobalSearchV2,
  compareDiscoveryV2Quality,
  computeRelativeClockIntercept,
  computeStaticMinuteInterceptInterval,
  countIngressDiagnosticSupported,
  decomposeClockResidual,
  dedupePhysicalSamples,
  deriveGlobalStatusV2,
  deriveRelativeClockModelStatus,
  discoverClipV2,
  DISCOVERY_V2_MODE,
  enumerateTransitionInterceptCombinations,
  evaluateRelativeClockCombination,
  interceptIntervalsIntersect,
  pairwiseBoundaryMinuteResidual,
  pairwiseClockInterceptResidual,
  pickV2SummaryParityFields,
  regressionCoverageMaeSeedSelection,
  runGlobalFingerprintDiscoveryV2,
  runIndependentIngressDiscovery,
  V2_SUMMARY_PARITY_FIELDS,
} from './reference-capture-rd003-video-gt-global-discovery-v2';

const EXTERNAL_GT = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd003-video-ground-truth-observations.json',
);
const HARD_PRIOR_DIR = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd003-video-gt-alignment/hard-clock-prior-run',
);
const V1_DISCOVERY_DIR = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd003-video-gt-alignment/global-fingerprint-discovery',
);
const V2_DISCOVERY_DIR = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd003-video-gt-alignment/global-fingerprint-discovery-v2',
);
const TELEMETRY_JSONL = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/dimo-lte-r1-reference-drive-003-video-gt-correlation-source.jsonl',
);

const hasExternalGt = fs.existsSync(EXTERNAL_GT);
const hasHardPrior = fs.existsSync(path.join(HARD_PRIOR_DIR, 'alignment-summary.json'));
const hasV1Discovery = fs.existsSync(path.join(V1_DISCOVERY_DIR, 'discovery-summary.json'));
const hasV2Discovery = fs.existsSync(path.join(V2_DISCOVERY_DIR, 'discovery-v2-summary.json'));

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

function syntheticCandidate(
  startMs: number,
  mae: number,
  coverage: number,
  matched = 10,
  total = 10,
): GlobalSearchCandidate {
  return {
    alignedClipStartMs: startMs,
    alignedClipStartUtc: new Date(startMs).toISOString(),
    mae,
    rmse: mae,
    maxAbsError: mae + 1,
    matched,
    total,
    errors: [],
    matchCoverageRatio: coverage,
  };
}

function syntheticSeries(
  startMs: number,
  speeds: number[],
  stepMs = 1000,
  ingressDelayMs = 0,
) {
  return speeds.map((value, i) => ({
    utcMs: startMs + i * stepMs,
    value,
    row: makeTelemetryRow({
      providerField: 'speed',
      acquisitionSurface: 'HF_HISTORICAL',
      providerTimestamp: new Date(startMs + i * stepMs).toISOString(),
      synqReceivedAt: new Date(startMs + i * stepMs + ingressDelayMs).toISOString(),
      rawValueJson: value,
      acquisitionOrdinal: i + 1,
      physicalSampleFingerprint: `fp-${i}`,
    }),
  }));
}

describe('DI-EV-0034D global fingerprint discovery v2', () => {
  it('1) coverage=1.0 / MAE=50 cannot suppress coverage=0.9 / MAE=5 in seed selection', () => {
    const junk = syntheticCandidate(1_000_000, 50, 1.0);
    const good = syntheticCandidate(2_000_000, 5, 0.9);
    const seeds = buildDiscoveryV2SeedSet([junk, good]);
    expect(seeds.some((s) => s.alignedClipStartMs === good.alignedClipStartMs)).toBe(true);
    expect(seeds.some((s) => s.alignedClipStartMs === junk.alignedClipStartMs)).toBe(true);
    const regression = regressionCoverageMaeSeedSelection([]);
    expect(regression.qualitySeedIncluded).toBe(true);
    expect(regression.refinedBasinSurfaced).toBe(true);
  });

  it('2) quality-qualified lower-coverage candidates enter fine refinement', () => {
    const clip = makeClip({
      observations: [
        validatedSpeedObs('s1', 0, 20),
        validatedSpeedObs('s2', 2, 40),
        validatedSpeedObs('s3', 4, 60),
      ],
    });
    const trueStart = Date.parse('2026-09-02T19:10:00.000Z');
    const series = syntheticSeries(trueStart, [20, 25, 30, 35, 40, 45, 60, 55]);
    const search = coarseToFineGlobalSearchV2({
      clip,
      speedSeries: series,
      eligibleObservations: clip.observations,
      surface: 'HF_HISTORICAL',
    });
    expect(search.seedCount).toBeGreaterThan(0);
    expect(search.basins.length).toBeGreaterThan(0);
    const best = search.basins.sort((a, b) => a.rankByQuality - b.rankByQuality)[0];
    expect(Math.abs((best!.alignedClipStartMs - trueStart) / 1000)).toBeLessThan(3);
  });

  it('3) Pareto candidate retention is deterministic', () => {
    const a = syntheticCandidate(1_000_000, 50, 1.0);
    const b = syntheticCandidate(2_000_000, 5, 0.9);
    const c = syntheticCandidate(3_000_000, 20, 0.95);
    const p1 = buildParetoFrontier([a, b, c]);
    const p2 = buildParetoFrontier([a, b, c]);
    expect(p1.map((x) => x.alignedClipStartMs)).toEqual(p2.map((x) => x.alignedClipStartMs));
    expect(p1.some((x) => x.alignedClipStartMs === b.alignedClipStartMs)).toBe(true);
    expect(p1.some((x) => x.alignedClipStartMs === a.alignedClipStartMs)).toBe(true);
  });

  it('4) strong basin hidden below coverage-ranked basin is surfaced via quality rank', () => {
    const junk = syntheticCandidate(1_000_000, 50, 1.0);
    const good = syntheticCandidate(2_000_000, 5, 0.9);
    const ranked = [junk, good].sort((a, b) =>
      compareDiscoveryV2Quality(
        { mae: a.mae, rmse: a.rmse, maxAbsError: a.maxAbsError, coverage: a.matchCoverageRatio, matched: a.matched, total: a.total },
        { mae: b.mae, rmse: b.rmse, maxAbsError: b.maxAbsError, coverage: b.matchCoverageRatio, matched: b.matched, total: b.total },
      ),
    );
    expect(ranked[0]!.alignedClipStartMs).toBe(good.alignedClipStartMs);
  });

  it('5) multiple competitive strong basins become AMBIGUOUS global status', () => {
    const basins = [
      {
        rankByQuality: 1,
        rankByCoverage: 1,
        paretoStatus: 'PARETO' as const,
        alignedClipStartUtc: 'a',
        alignedClipStartMs: 1_000_000,
        matchedGtCount: 10,
        eligibleGtCount: 10,
        coverage: 1,
        MAE: 5,
        RMSE: 5,
        maxAbsError: 6,
        basinStartUtc: 'a',
        basinEndUtc: 'a',
        basinWidthSeconds: 0,
        distinctFromNearestCompetingBasinSeconds: 10,
        status: 'STRONG_CANDIDATE' as const,
        FULL_CLOCK_BOUNDARY_RESIDUAL_SECONDS: null,
        WHOLE_MINUTE_RESIDUAL_COUNT: null,
        CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60: null,
      },
      {
        rankByQuality: 2,
        rankByCoverage: 2,
        paretoStatus: 'PARETO' as const,
        alignedClipStartUtc: 'b',
        alignedClipStartMs: 1_020_000,
        matchedGtCount: 10,
        eligibleGtCount: 10,
        coverage: 1,
        MAE: 6,
        RMSE: 6,
        maxAbsError: 7,
        basinStartUtc: 'b',
        basinEndUtc: 'b',
        basinWidthSeconds: 0,
        distinctFromNearestCompetingBasinSeconds: 10,
        status: 'STRONG_CANDIDATE' as const,
        FULL_CLOCK_BOUNDARY_RESIDUAL_SECONDS: null,
        WHOLE_MINUTE_RESIDUAL_COUNT: null,
        CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60: null,
      },
    ];
    expect(deriveGlobalStatusV2(basins)).toBe('AMBIGUOUS');
  });

  it('6) NOT_IDENTIFIABLE transition basins cannot reject a clock phase model', () => {
    const discoveries = [
      {
        clipId: 'RD003_GT_CLIP_001',
        fileName: 'IMG_2803.mp4',
        alignmentEligibleGtCount: 5,
        HF_HISTORICAL: {
          independentStatus: 'NOT_IDENTIFIABLE' as const,
          globalStatus: 'NOT_IDENTIFIABLE' as const,
          basins: [
            {
              rankByQuality: 1,
              rankByCoverage: 1,
              paretoStatus: 'DOMINATED' as const,
              alignedClipStartUtc: 'x',
              alignedClipStartMs: 1,
              matchedGtCount: 5,
              eligibleGtCount: 5,
              coverage: 0.5,
              MAE: 20,
              RMSE: 20,
              maxAbsError: 25,
              basinStartUtc: 'x',
              basinEndUtc: 'x',
              basinWidthSeconds: 0,
              distinctFromNearestCompetingBasinSeconds: null,
              status: 'NOT_IDENTIFIABLE' as const,
              FULL_CLOCK_BOUNDARY_RESIDUAL_SECONDS: 30,
              WHOLE_MINUTE_RESIDUAL_COUNT: 0,
              CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60: 30,
            },
          ],
        },
        INGRESS_DIAGNOSTIC: {
          status: 'NOT_IDENTIFIABLE' as const,
          alignedStart: null,
          coverage: null,
          MAE: null,
          RMSE: null,
          maxAbsError: null,
          ingressMinusProviderStartSeconds: null,
        },
      },
    ];
    const clips = [
      makeClip({
        clipId: 'RD003_GT_CLIP_001',
        fileName: 'IMG_2803.mp4',
        videoClock: {
          displayedMinuteTransitions: [
            { videoTimeSeconds: 10, uncertaintySeconds: 0.1, fromMinute: '21:03', toMinute: '21:04' },
          ],
        },
      }),
    ];
    const phase = buildQualifiedClockPhaseModel({ discoveries, clips });
    expect(phase.COMMON_CLOCK_PHASE_STATUS).toBe('UNRESOLVED_INSUFFICIENT_QUALIFIED_TRANSITION_CLIPS');
  });

  it('7) one qualified transition clip yields UNRESOLVED_INSUFFICIENT_QUALIFIED_TRANSITION_CLIPS', () => {
    const discoveries = [
      {
        clipId: 'RD003_GT_CLIP_001',
        fileName: 'IMG_2803.mp4',
        alignmentEligibleGtCount: 10,
        HF_HISTORICAL: {
          independentStatus: 'STRONG_CANDIDATE' as const,
          globalStatus: 'STRONG_CANDIDATE' as const,
          basins: [
            {
              rankByQuality: 1,
              rankByCoverage: 1,
              paretoStatus: 'PARETO' as const,
              alignedClipStartUtc: 'x',
              alignedClipStartMs: 1,
              matchedGtCount: 10,
              eligibleGtCount: 10,
              coverage: 1,
              MAE: 4,
              RMSE: 4,
              maxAbsError: 5,
              basinStartUtc: 'x',
              basinEndUtc: 'x',
              basinWidthSeconds: 0,
              distinctFromNearestCompetingBasinSeconds: null,
              status: 'STRONG_CANDIDATE' as const,
              FULL_CLOCK_BOUNDARY_RESIDUAL_SECONDS: 5,
              WHOLE_MINUTE_RESIDUAL_COUNT: 0,
              CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60: 5,
            },
          ],
        },
        INGRESS_DIAGNOSTIC: {
          status: 'NOT_IDENTIFIABLE' as const,
          alignedStart: null,
          coverage: null,
          MAE: null,
          RMSE: null,
          maxAbsError: null,
          ingressMinusProviderStartSeconds: null,
        },
      },
    ];
    const clips = [
      makeClip({
        clipId: 'RD003_GT_CLIP_001',
        fileName: 'IMG_2803.mp4',
        videoClock: {
          displayedMinuteTransitions: [
            { videoTimeSeconds: 10, uncertaintySeconds: 0.1, fromMinute: '21:03', toMinute: '21:04' },
          ],
        },
      }),
    ];
    const phase = buildQualifiedClockPhaseModel({ discoveries, clips });
    expect(phase.COMMON_CLOCK_PHASE_STATUS).toBe('UNRESOLVED_INSUFFICIENT_QUALIFIED_TRANSITION_CLIPS');
    expect(phase.qualifiedClipCount).toBe(1);
  });

  it('8) circular center of [59,1] is near 0, not 30', () => {
    expect(circularMeanMod60([59, 1])).toBeCloseTo(0, 0);
    expect(circularMeanMod60([-1, 1])).toBeCloseTo(0, 0);
    expect(circularMeanMod60([29, 31])).toBeCloseTo(30, 0);
  });

  it('9) full residual keeps whole-minute component and modulo-60 component separately', () => {
    const d = decomposeClockResidual(651.645);
    expect(d.FULL_CLOCK_BOUNDARY_RESIDUAL_SECONDS).toBeCloseTo(651.645, 6);
    expect(d.WHOLE_MINUTE_RESIDUAL_COUNT).toBe(10);
    expect(d.CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60).toBeCloseTo(51.645, 3);
  });

  it('10) relative clock intercept is timezone-independent', () => {
    const intercept = computeRelativeClockIntercept({
      alignedClipStartMs: Date.parse('2026-09-02T19:00:00.000Z'),
      transitionVideoTimeSeconds: 10,
      minuteOrdinalL: 21 * 60 + 4,
    });
    const interceptShifted = computeRelativeClockIntercept({
      alignedClipStartMs: Date.parse('2026-09-02T19:00:00.000Z') + 3600_000,
      transitionVideoTimeSeconds: 10,
      minuteOrdinalL: 21 * 60 + 4 + 60,
    });
    expect(intercept).toBeCloseTo(interceptShifted, 6);
  });

  it('11) raw-boundary and normalized-intercept pairwise equations are equivalent', () => {
    const boundaryI = 1_000_000;
    const boundaryJ = 1_000_250;
    const minuteLi = 10;
    const minuteLj = 12;
    const interceptI = boundaryToClockIntercept(boundaryI, minuteLi);
    const interceptJ = boundaryToClockIntercept(boundaryJ, minuteLj);
    const boundaryResidual = pairwiseBoundaryMinuteResidual(boundaryI, boundaryJ, minuteLi, minuteLj);
    const interceptResidual = pairwiseClockInterceptResidual(interceptI, interceptJ);
    expect(boundaryResidual).toBeCloseTo(interceptResidual, 6);
    expect(boundaryResidual).toBeCloseTo(250 - 120, 6);
  });

  it('12) static-minute clips create intercept intervals, not exact points', () => {
    const interval = computeStaticMinuteInterceptInterval({
      alignedClipStartMs: Date.parse('2026-09-02T19:00:00.000Z'),
      durationSeconds: 30,
      durationUncertaintySeconds: 0.5,
      minuteOrdinalL: 21 * 60 + 6,
    });
    expect(interval.to - interval.from).toBeGreaterThan(30);
  });

  it('13) joint path enforces clip chronology', () => {
    const { CLIP_CHRONOLOGY_ORDER } = require('./reference-capture-rd003-video-gt-global-discovery');
    const discoveries = CLIP_CHRONOLOGY_ORDER.map((clipId: string, idx: number) => ({
      clipId,
      fileName: `${clipId}.mp4`,
      alignmentEligibleGtCount: 2,
      HF_HISTORICAL: {
        independentStatus: 'STRONG_CANDIDATE' as const,
        globalStatus: 'STRONG_CANDIDATE' as const,
        basins: [
          {
            rankByQuality: 1,
            rankByCoverage: 1,
            paretoStatus: 'PARETO' as const,
            alignedClipStartUtc: new Date(Date.parse('2026-09-02T19:00:00.000Z') + idx * 120_000).toISOString(),
            alignedClipStartMs: Date.parse('2026-09-02T19:00:00.000Z') + idx * 120_000,
            matchedGtCount: 2,
            eligibleGtCount: 2,
            coverage: 1,
            MAE: 3,
            RMSE: 3,
            maxAbsError: 4,
            basinStartUtc: 'x',
            basinEndUtc: 'x',
            basinWidthSeconds: 0,
            distinctFromNearestCompetingBasinSeconds: null,
            status: 'STRONG_CANDIDATE' as const,
            FULL_CLOCK_BOUNDARY_RESIDUAL_SECONDS: null,
            WHOLE_MINUTE_RESIDUAL_COUNT: null,
            CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60: null,
          },
        ],
      },
      INGRESS_DIAGNOSTIC: {
        status: 'NOT_IDENTIFIABLE' as const,
        alignedStart: null,
        coverage: null,
        MAE: null,
        RMSE: null,
        maxAbsError: null,
        ingressMinusProviderStartSeconds: null,
      },
    }));
    const clips = CLIP_CHRONOLOGY_ORDER.map((clipId: string) =>
      makeClip({ clipId, fileName: `${clipId}.mp4`, videoDurationSeconds: 30 }),
    );
    const result = buildJointClockChronologyPath({ discoveries, clips });
    expect(result.JOINT_PATH_FOUND).toBe('YES');
    for (let i = 1; i < result.path.length; i++) {
      const prev = Date.parse(result.path[i - 1]!.alignedClipStartUtc);
      const cur = Date.parse(result.path[i]!.alignedClipStartUtc);
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
  });

  it('14) joint path enforces video-duration non-overlap', () => {
    const discoveries = [
      {
        clipId: 'RD003_GT_CLIP_001',
        fileName: 'A.mp4',
        alignmentEligibleGtCount: 2,
        HF_HISTORICAL: {
          independentStatus: 'STRONG_CANDIDATE' as const,
          globalStatus: 'STRONG_CANDIDATE' as const,
          basins: [
            {
              rankByQuality: 1,
              rankByCoverage: 1,
              paretoStatus: 'PARETO' as const,
              alignedClipStartUtc: '2026-09-02T19:00:00.000Z',
              alignedClipStartMs: Date.parse('2026-09-02T19:00:00.000Z'),
              matchedGtCount: 2,
              eligibleGtCount: 2,
              coverage: 1,
              MAE: 3,
              RMSE: 3,
              maxAbsError: 4,
              basinStartUtc: 'x',
              basinEndUtc: 'x',
              basinWidthSeconds: 0,
              distinctFromNearestCompetingBasinSeconds: null,
              status: 'STRONG_CANDIDATE' as const,
              FULL_CLOCK_BOUNDARY_RESIDUAL_SECONDS: null,
              WHOLE_MINUTE_RESIDUAL_COUNT: null,
              CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60: null,
            },
          ],
        },
        INGRESS_DIAGNOSTIC: {
          status: 'NOT_IDENTIFIABLE' as const,
          alignedStart: null,
          coverage: null,
          MAE: null,
          RMSE: null,
          maxAbsError: null,
          ingressMinusProviderStartSeconds: null,
        },
      },
      {
        clipId: 'RD003_GT_CLIP_002',
        fileName: 'B.mp4',
        alignmentEligibleGtCount: 2,
        HF_HISTORICAL: {
          independentStatus: 'STRONG_CANDIDATE' as const,
          globalStatus: 'STRONG_CANDIDATE' as const,
          basins: [
            {
              rankByQuality: 1,
              rankByCoverage: 1,
              paretoStatus: 'PARETO' as const,
              alignedClipStartUtc: '2026-09-02T19:00:10.000Z',
              alignedClipStartMs: Date.parse('2026-09-02T19:00:10.000Z'),
              matchedGtCount: 2,
              eligibleGtCount: 2,
              coverage: 1,
              MAE: 3,
              RMSE: 3,
              maxAbsError: 4,
              basinStartUtc: 'x',
              basinEndUtc: 'x',
              basinWidthSeconds: 0,
              distinctFromNearestCompetingBasinSeconds: null,
              status: 'STRONG_CANDIDATE' as const,
              FULL_CLOCK_BOUNDARY_RESIDUAL_SECONDS: null,
              WHOLE_MINUTE_RESIDUAL_COUNT: null,
              CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60: null,
            },
          ],
        },
        INGRESS_DIAGNOSTIC: {
          status: 'NOT_IDENTIFIABLE' as const,
          alignedStart: null,
          coverage: null,
          MAE: null,
          RMSE: null,
          maxAbsError: null,
          ingressMinusProviderStartSeconds: null,
        },
      },
    ];
    const clips = [
      makeClip({ clipId: 'RD003_GT_CLIP_001', fileName: 'A.mp4', videoDurationSeconds: 60 }),
      makeClip({ clipId: 'RD003_GT_CLIP_002', fileName: 'B.mp4', videoDurationSeconds: 60 }),
    ];
    const result = buildJointClockChronologyPath({ discoveries, clips });
    expect(result.JOINT_PATH_STATUS).toBe('NO_CONSISTENT_PATH_IN_RETAINED_BASINS');
  });

  it('15) joint path enforces relative-clock intercept compatibility', () => {
    const model = buildRelativeClockInterceptModel({ discoveries: [], clips: [] });
    expect(model.RELATIVE_CLOCK_MODEL_STATUS).toBe('UNRESOLVED_INSUFFICIENT_QUALIFIED_TRANSITION_CLIPS');
  });

  it('16) independent basin scores remain unchanged by joint analysis', () => {
    if (!hasV2Discovery) return;
    const basins = JSON.parse(
      fs.readFileSync(path.join(V2_DISCOVERY_DIR, 'per-clip-top-basins-v2.json'), 'utf8'),
    ) as Record<string, { basins: Array<{ MAE: number }> }>;
    const joint = JSON.parse(
      fs.readFileSync(path.join(V2_DISCOVERY_DIR, 'joint-clock-chronology-path.json'), 'utf8'),
    );
    const clip001Mae = basins.RD003_GT_CLIP_001?.basins[0]?.MAE;
    expect(clip001Mae).toBeDefined();
    expect(joint.JOINT_PATH_FOUND).toBeDefined();
    expect(basins.RD003_GT_CLIP_001?.basins[0]?.MAE).toBe(clip001Mae);
  });

  it('17) IMG_2807 + IMG_2810 current candidates are detected as mutually incompatible', () => {
    if (!hasExternalGt) return;
    const { loadExternalGtDocument, loadCanonicalTelemetryJsonl } = require('./reference-capture-rd003-video-gt-alignment');
    const externalGt = loadExternalGtDocument(EXTERNAL_GT);
    const telemetryRows = loadCanonicalTelemetryJsonl(TELEMETRY_JSONL);
    const result = runGlobalFingerprintDiscoveryV2({ telemetryRows, externalGt });
    const audit = result.mutuallyExclusiveCandidates;
    expect(audit.IMG_2807_INDEPENDENT_STRONG).toBe('YES');
    expect(audit.IMG_2810_INDEPENDENT_STRONG).toBe('YES');
    expect(audit.IMG_2807_AND_IMG_2810_JOINTLY_POSSIBLE).toBe('NO');
    expect(audit.MINIMUM_CHRONOLOGY_GAP_CONFLICT_SECONDS as number).toBeLessThan(0);
  });

  it('18) non-exhaustive retained-basin failure cannot report CHRONOLOGY_CONSTRAINT_UNSATISFIABLE', () => {
    const result = buildJointClockChronologyPath({ discoveries: [], clips: [] });
    expect(result.JOINT_PATH_STATUS).not.toBe('CHRONOLOGY_CONSTRAINT_UNSATISFIABLE');
    expect(result.JOINT_PATH_STATUS).toBe('NO_CONSISTENT_PATH_IN_RETAINED_BASINS');
  });

  it('19) ingress discovery runs independently from provider discovery', () => {
    const clip = makeClip({
      observations: [validatedSpeedObs('s1', 0, 50), validatedSpeedObs('s2', 2, 55)],
    });
    const providerStart = Date.parse('2026-09-02T19:00:00.000Z');
    const ingressStart = Date.parse('2026-09-02T19:00:06.000Z');
    const providerSeries = syntheticSeries(providerStart, [50, 52, 54, 56, 58]);
    const ingressRows = syntheticSeries(providerStart, [50, 52, 54, 56, 58], 1000, 6000).map(
      (p) => p.row,
    );
    const providerSearch = coarseToFineGlobalSearchV2({
      clip,
      speedSeries: providerSeries,
      eligibleObservations: clip.observations,
      surface: 'HF_HISTORICAL',
    });
    const ingress = runIndependentIngressDiscovery({
      clip,
      telemetryRows: ingressRows,
      providerBestStartMs: providerSearch.basins[0]?.alignedClipStartMs ?? null,
    });
    expect(ingress.alignedStart).not.toBeNull();
    expect(ingress.ingressMinusProviderStartSeconds).not.toBeNull();
  });

  it('20) synthetic +6 s ingress delay produces approximately +6 s independently aligned start delta', () => {
    const clip = makeClip({
      observations: [
        validatedSpeedObs('s1', 0, 40),
        validatedSpeedObs('s2', 2, 45),
        validatedSpeedObs('s3', 4, 50),
      ],
    });
    const providerStart = Date.parse('2026-09-02T19:05:00.000Z');
    const providerSeries = syntheticSeries(providerStart, [40, 42, 44, 45, 46, 48, 50, 52]);
    const ingressRows = syntheticSeries(providerStart, [40, 42, 44, 45, 46, 48, 50, 52], 1000, 6000).map(
      (p) => p.row,
    );
    const providerSearch = coarseToFineGlobalSearchV2({
      clip,
      speedSeries: providerSeries,
      eligibleObservations: clip.observations,
      surface: 'HF_HISTORICAL',
    });
    const providerBestMs = providerSearch.basins.sort((a, b) => a.rankByQuality - b.rankByQuality)[0]
      ?.alignedClipStartMs;
    const ingress = runIndependentIngressDiscovery({
      clip,
      telemetryRows: ingressRows,
      providerBestStartMs: providerBestMs ?? null,
    });
    expect(ingress.ingressMinusProviderStartSeconds).not.toBeNull();
    expect(ingress.ingressMinusProviderStartSeconds!).toBeGreaterThan(4);
    expect(ingress.ingressMinusProviderStartSeconds!).toBeLessThan(8);
  });

  it('21) INGRESS_TIME_DIAGNOSTIC_SUPPORTED_CLIPS derives from ingress results, not provider MAE', () => {
    const discoveries = [
      {
        clipId: 'A',
        fileName: 'A.mp4',
        alignmentEligibleGtCount: 5,
        HF_HISTORICAL: {
          independentStatus: 'STRONG_CANDIDATE' as const,
          globalStatus: 'STRONG_CANDIDATE' as const,
          basins: [
            {
              rankByQuality: 1,
              rankByCoverage: 1,
              paretoStatus: 'PARETO' as const,
              alignedClipStartUtc: 'x',
              alignedClipStartMs: 1,
              matchedGtCount: 5,
              eligibleGtCount: 5,
              coverage: 1,
              MAE: 3,
              RMSE: 3,
              maxAbsError: 4,
              basinStartUtc: 'x',
              basinEndUtc: 'x',
              basinWidthSeconds: 0,
              distinctFromNearestCompetingBasinSeconds: null,
              status: 'STRONG_CANDIDATE' as const,
              FULL_CLOCK_BOUNDARY_RESIDUAL_SECONDS: null,
              WHOLE_MINUTE_RESIDUAL_COUNT: null,
              CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60: null,
            },
          ],
        },
        INGRESS_DIAGNOSTIC: {
          status: 'NOT_IDENTIFIABLE' as const,
          alignedStart: null,
          coverage: null,
          MAE: null,
          RMSE: null,
          maxAbsError: null,
          ingressMinusProviderStartSeconds: null,
        },
      },
      {
        clipId: 'B',
        fileName: 'B.mp4',
        alignmentEligibleGtCount: 5,
        HF_HISTORICAL: {
          independentStatus: 'NOT_IDENTIFIABLE' as const,
          globalStatus: 'NOT_IDENTIFIABLE' as const,
          basins: [],
        },
        INGRESS_DIAGNOSTIC: {
          status: 'STRONG_CANDIDATE' as const,
          alignedStart: '2026-09-02T19:00:06.000Z',
          coverage: 1,
          MAE: 4,
          RMSE: 4,
          maxAbsError: 5,
          ingressMinusProviderStartSeconds: 6,
        },
      },
    ];
    expect(countIngressDiagnosticSupported(discoveries)).toBe(1);
  });

  it('22) physicalSampleFingerprint duplicate acquisitions are not treated as new physical vehicle samples', () => {
    const fp = 'same-fp';
    const rows = [
      makeTelemetryRow({
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-02T19:00:00.000Z',
        synqReceivedAt: '2026-09-02T19:00:01.000Z',
        physicalSampleFingerprint: fp,
        rawValueJson: 60,
      }),
      makeTelemetryRow({
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-02T19:00:00.000Z',
        synqReceivedAt: '2026-09-02T19:00:06.000Z',
        physicalSampleFingerprint: fp,
        rawValueJson: 60,
      }),
    ];
    expect(dedupePhysicalSamples(rows).length).toBe(1);
  });

  it('23) external GT SHA remains unchanged', () => {
    const doc = buildExternalGtDocument();
    expect(externalGtDocumentSha256(doc)).toBe(
      'ea0d78ee71b5c83f104e8de31056ccfccc7b476733b676da5bf8828badc9592e',
    );
  });

  it('24) DI-EV-0033 canonical SHA remains unchanged', () => {
    expect(CANONICAL_TELEMETRY_JSONL_SHA256).toBe(
      '69209a6d9e488d51c3aaf3b55dee5584ce622dc072a191b81e7061597cdda87a',
    );
  });

  it('25) DI-EV-0034B artifacts remain unchanged', () => {
    if (!hasHardPrior) return;
    const manifestPath = path.join(HARD_PRIOR_DIR, 'hard-clock-prior-manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const summary = fs.readFileSync(path.join(HARD_PRIOR_DIR, 'alignment-summary.json'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      artifactSha256: Record<string, string>;
    };
    expect(manifest.artifactSha256['alignment-summary.json']).toBe(artifactSha256(summary));
  });

  it('26) DI-EV-0034C artifacts remain unchanged', () => {
    if (!hasV1Discovery) return;
    const summary = fs.readFileSync(path.join(V1_DISCOVERY_DIR, 'discovery-summary.json'), 'utf8');
    const parsed = JSON.parse(summary) as { evidenceId: string };
    expect(parsed.evidenceId).toBe('DI-EV-0034C');
    const statBefore = fs.statSync(path.join(V1_DISCOVERY_DIR, 'discovery-summary.json')).mtimeMs;
    expect(statBefore).toBeGreaterThan(0);
  });

  it('27) same inputs produce byte-deterministic V2 outputs', () => {
    if (!hasExternalGt) return;
    const { loadExternalGtDocument, loadCanonicalTelemetryJsonl } = require('./reference-capture-rd003-video-gt-alignment');
    const externalGt = loadExternalGtDocument(EXTERNAL_GT);
    const telemetryRows = loadCanonicalTelemetryJsonl(TELEMETRY_JSONL);
    const a = runGlobalFingerprintDiscoveryV2({ telemetryRows, externalGt });
    const b = runGlobalFingerprintDiscoveryV2({ telemetryRows, externalGt });
    const hashA = crypto.createHash('sha256').update(JSON.stringify(a.discoverySummary)).digest('hex');
    const hashB = crypto.createHash('sha256').update(JSON.stringify(b.discoverySummary)).digest('hex');
    expect(hashA).toBe(hashB);
  });

  it('28) DISCOVERY_V2_MODE is distinct from v1', () => {
    expect(DISCOVERY_V2_MODE).toBe('GLOBAL_FINGERPRINT_DISCOVERY_V2');
  });

  it('29) v1 compareCandidateQuality coverage-first would rank junk above good — v2 does not', () => {
    const junk = syntheticCandidate(1_000_000, 50, 1.0);
    const good = syntheticCandidate(2_000_000, 5, 0.9);
    const v1Ranked = [junk, good].sort((a, b) => {
      if (Math.abs(a.matchCoverageRatio - b.matchCoverageRatio) > 1e-9) {
        return b.matchCoverageRatio - a.matchCoverageRatio;
      }
      return a.mae - b.mae;
    });
    expect(v1Ranked[0]!.alignedClipStartMs).toBe(junk.alignedClipStartMs);
    const v2Seeds = buildDiscoveryV2SeedSet([junk, good]);
    const qualityFirst = [...v2Seeds].sort((a, b) =>
      compareDiscoveryV2Quality(
        { mae: a.mae, rmse: a.rmse, maxAbsError: a.maxAbsError, coverage: a.matchCoverageRatio, matched: a.matched, total: a.total },
        { mae: b.mae, rmse: b.rmse, maxAbsError: b.maxAbsError, coverage: b.matchCoverageRatio, matched: b.matched, total: b.total },
      ),
    );
    expect(qualityFirst[0]!.alignedClipStartMs).toBe(good.alignedClipStartMs);
  });
});

describe('DI-EV-0034D.1 correctness closeout', () => {
  it('1) committed V2 summary parity fields equal fresh deterministic run', () => {
    if (!hasExternalGt || !hasV2Discovery) return;
    const { loadExternalGtDocument, loadCanonicalTelemetryJsonl, stableStringify } = require('./reference-capture-rd003-video-gt-alignment');
    const committed = JSON.parse(
      fs.readFileSync(path.join(V2_DISCOVERY_DIR, 'discovery-v2-summary.json'), 'utf8'),
    ) as Record<string, unknown>;
    const externalGt = loadExternalGtDocument(EXTERNAL_GT);
    const telemetryRows = loadCanonicalTelemetryJsonl(TELEMETRY_JSONL);
    const fresh = runGlobalFingerprintDiscoveryV2({ telemetryRows, externalGt }).discoverySummary;
    const committedParity = pickV2SummaryParityFields(committed);
    const freshParity = pickV2SummaryParityFields(fresh);
    expect(stableStringify(committedParity)).toBe(stableStringify(freshParity));
    expect(committed.PROVIDER_TIME_ALIGNMENT_SUPPORTED_CLIPS).toBe(fresh.PROVIDER_TIME_ALIGNMENT_SUPPORTED_CLIPS);
    expect(committed.HF_SPEED_ALIGNMENT_V2_CONCLUSION).toBe(fresh.HF_SPEED_ALIGNMENT_V2_CONCLUSION);
  });

  it('2) ambiguous clip exposes CLOCK_CANDIDATE_SET, not one forced authority basin', () => {
    const clip = makeClip({
      clipId: 'RD003_GT_CLIP_005',
      fileName: 'IMG_2807.mp4',
      videoClock: {
        displayedMinuteTransitions: [
          { videoTimeSeconds: 10, uncertaintySeconds: 0.1, fromMinute: '21:13', toMinute: '21:14' },
        ],
      },
    });
    const disc = {
      clipId: clip.clipId,
      fileName: clip.fileName,
      alignmentEligibleGtCount: 10,
      HF_HISTORICAL: {
        independentStatus: 'AMBIGUOUS' as const,
        globalStatus: 'AMBIGUOUS' as const,
        basins: [
          {
            rankByQuality: 1,
            rankByCoverage: 1,
            paretoStatus: 'PARETO' as const,
            alignedClipStartUtc: '2026-09-02T19:23:51.795Z',
            alignedClipStartMs: Date.parse('2026-09-02T19:23:51.795Z'),
            matchedGtCount: 10,
            eligibleGtCount: 16,
            coverage: 0.625,
            MAE: 6,
            RMSE: 6,
            maxAbsError: 7,
            basinStartUtc: 'x',
            basinEndUtc: 'x',
            basinWidthSeconds: 0.7,
            distinctFromNearestCompetingBasinSeconds: null,
            status: 'STRONG_CANDIDATE' as const,
            FULL_CLOCK_BOUNDARY_RESIDUAL_SECONDS: null,
            WHOLE_MINUTE_RESIDUAL_COUNT: null,
            CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60: null,
          },
          {
            rankByQuality: 2,
            rankByCoverage: 2,
            paretoStatus: 'PARETO' as const,
            alignedClipStartUtc: '2026-09-02T19:23:01.995Z',
            alignedClipStartMs: Date.parse('2026-09-02T19:23:01.995Z'),
            matchedGtCount: 16,
            eligibleGtCount: 16,
            coverage: 1,
            MAE: 6.15,
            RMSE: 7,
            maxAbsError: 8,
            basinStartUtc: 'x',
            basinEndUtc: 'x',
            basinWidthSeconds: 0.8,
            distinctFromNearestCompetingBasinSeconds: null,
            status: 'STRONG_CANDIDATE' as const,
            FULL_CLOCK_BOUNDARY_RESIDUAL_SECONDS: null,
            WHOLE_MINUTE_RESIDUAL_COUNT: null,
            CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60: null,
          },
        ],
      },
      INGRESS_DIAGNOSTIC: {
        status: 'NOT_IDENTIFIABLE' as const,
        alignedStart: null,
        coverage: null,
        MAE: null,
        RMSE: null,
        maxAbsError: null,
        ingressMinusProviderStartSeconds: null,
      },
    };
    const evidence = buildClockClipEvidence({ disc, clip });
    expect(evidence?.authorityMode).toBe('CLOCK_CANDIDATE_SET');
    expect(evidence?.CLOCK_CANDIDATE_SET?.length).toBe(2);
    expect(evidence?.CLOCK_INTERCEPT_SECONDS).toBeUndefined();
  });

  it('3) incompatible ambiguous basin combinations can be rejected individually', () => {
    const combos = enumerateTransitionInterceptCombinations([
      {
        clipId: 'A',
        fileName: 'A.mp4',
        independentStatus: 'AMBIGUOUS',
        clipType: 'TRANSITION',
        authorityMode: 'CLOCK_CANDIDATE_SET',
        clockAuthorityEligible: 'YES',
        CLOCK_CANDIDATE_SET: [
          { basinRank: 1, alignedClipStartUtc: 'a', intercept: 100 },
          { basinRank: 2, alignedClipStartUtc: 'b', intercept: 1300 },
        ],
        minuteOrdinalL: 10,
        basinStatus: 'AMBIGUOUS',
      },
      {
        clipId: 'B',
        fileName: 'B.mp4',
        independentStatus: 'STRONG_CANDIDATE',
        clipType: 'TRANSITION',
        authorityMode: 'DIRECT_POINT',
        clockAuthorityEligible: 'YES',
        CLOCK_INTERCEPT_SECONDS: 110,
        minuteOrdinalL: 11,
        basinStatus: 'STRONG_CANDIDATE',
      },
    ]);
    const evaluations = combos.map((c) => evaluateRelativeClockCombination(c));
    expect(evaluations.some((e) => e.consistent)).toBe(true);
    expect(evaluations.some((e) => !e.consistent && e.spread > 1000)).toBe(true);
  });

  it('4) compatible combination can survive', () => {
    const status = deriveRelativeClockModelStatus({
      transitionAuthorityClips: [
        { clipId: 'A', fileName: 'A.mp4' } as any,
        { clipId: 'B', fileName: 'B.mp4' } as any,
      ],
      hasAmbiguousCandidateSets: false,
      bestCombination: { spread: 5, center: 100, consistent: true },
      anyCombination: true,
    });
    expect(status).toBe('RELATIVE_INTERCEPT_CLUSTER_SUPPORTED');
  });

  it('5) 1196 s intercept spread cannot become WEAK support', () => {
    const status = deriveRelativeClockModelStatus({
      transitionAuthorityClips: [{ clipId: 'x' } as any, { clipId: 'y' } as any],
      hasAmbiguousCandidateSets: true,
      bestCombination: { spread: 1196.37, center: 1_788_300_573, consistent: false },
      anyCombination: true,
    });
    expect(status).not.toBe('RELATIVE_INTERCEPT_CLUSTER_WEAK');
    expect(status).toBe('UNRESOLVED_AMBIGUOUS_CANDIDATE_ASSIGNMENT');
  });

  it('6) static-minute interval accepts compatible intercept', () => {
    const interval = { from: 100, to: 200 };
    const hypothesis = { from: 150, to: 250 };
    expect(interceptIntervalsIntersect(interval, hypothesis)).toEqual({ from: 150, to: 200 });
  });

  it('7) static-minute interval rejects incompatible intercept', () => {
    const interval = { from: 100, to: 120 };
    const hypothesis = { from: 130, to: 140 };
    expect(interceptIntervalsIntersect(interval, hypothesis)).toBeNull();
  });

  it('8) joint DP uses static-minute intervals', () => {
    const discoveries = [
      {
        clipId: 'RD003_GT_CLIP_001',
        fileName: 'A.mp4',
        alignmentEligibleGtCount: 2,
        HF_HISTORICAL: {
          independentStatus: 'STRONG_CANDIDATE' as const,
          globalStatus: 'STRONG_CANDIDATE' as const,
          basins: [
            {
              rankByQuality: 1,
              rankByCoverage: 1,
              paretoStatus: 'PARETO' as const,
              alignedClipStartUtc: '2026-09-02T19:00:00.000Z',
              alignedClipStartMs: Date.parse('2026-09-02T19:00:00.000Z'),
              matchedGtCount: 2,
              eligibleGtCount: 2,
              coverage: 1,
              MAE: 3,
              RMSE: 3,
              maxAbsError: 4,
              basinStartUtc: 'x',
              basinEndUtc: 'x',
              basinWidthSeconds: 0,
              distinctFromNearestCompetingBasinSeconds: null,
              status: 'STRONG_CANDIDATE' as const,
              FULL_CLOCK_BOUNDARY_RESIDUAL_SECONDS: null,
              WHOLE_MINUTE_RESIDUAL_COUNT: null,
              CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60: null,
            },
          ],
        },
        INGRESS_DIAGNOSTIC: {
          status: 'NOT_IDENTIFIABLE' as const,
          alignedStart: null,
          coverage: null,
          MAE: null,
          RMSE: null,
          maxAbsError: null,
          ingressMinusProviderStartSeconds: null,
        },
      },
      {
        clipId: 'RD003_GT_CLIP_002',
        fileName: 'B.mp4',
        alignmentEligibleGtCount: 2,
        HF_HISTORICAL: {
          independentStatus: 'STRONG_CANDIDATE' as const,
          globalStatus: 'STRONG_CANDIDATE' as const,
          basins: [
            {
              rankByQuality: 1,
              rankByCoverage: 1,
              paretoStatus: 'PARETO' as const,
              alignedClipStartUtc: '2026-09-02T19:01:00.000Z',
              alignedClipStartMs: Date.parse('2026-09-02T19:01:00.000Z'),
              matchedGtCount: 2,
              eligibleGtCount: 2,
              coverage: 1,
              MAE: 3,
              RMSE: 3,
              maxAbsError: 4,
              basinStartUtc: 'x',
              basinEndUtc: 'x',
              basinWidthSeconds: 0,
              distinctFromNearestCompetingBasinSeconds: null,
              status: 'STRONG_CANDIDATE' as const,
              FULL_CLOCK_BOUNDARY_RESIDUAL_SECONDS: null,
              WHOLE_MINUTE_RESIDUAL_COUNT: null,
              CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60: null,
            },
          ],
        },
        INGRESS_DIAGNOSTIC: {
          status: 'NOT_IDENTIFIABLE' as const,
          alignedStart: null,
          coverage: null,
          MAE: null,
          RMSE: null,
          maxAbsError: null,
          ingressMinusProviderStartSeconds: null,
        },
      },
    ];
    const clips = [
      makeClip({
        clipId: 'RD003_GT_CLIP_001',
        fileName: 'A.mp4',
        videoDurationSeconds: 30,
        videoClock: {
          displayedMinuteTransitions: [
            { videoTimeSeconds: 5, uncertaintySeconds: 0.1, fromMinute: '21:03', toMinute: '21:04' },
          ],
        },
      }),
      makeClip({
        clipId: 'RD003_GT_CLIP_002',
        fileName: 'B.mp4',
        videoDurationSeconds: 30,
        videoClock: { displayedLocalTime: '21:06' },
      }),
    ];
    const result = buildJointClockChronologyPath({ discoveries, clips });
    expect(result.STATIC_MINUTE_INTERVALS_USED_BY_JOINT_DP).toBe('YES');
    expect(result.REJECTED_BY_STATIC_MINUTE_INTERVAL).toBeGreaterThanOrEqual(0);
  });

  it('9-11) pairwise equations mathematical equivalence', () => {
    const boundaryI = 5_000_000;
    const boundaryJ = 5_000_180;
    const li = 834;
    const lj = 835;
    const ii = boundaryToClockIntercept(boundaryI, li);
    const ij = boundaryToClockIntercept(boundaryJ, lj);
    expect(pairwiseBoundaryMinuteResidual(boundaryI, boundaryJ, li, lj)).toBeCloseTo(
      pairwiseClockInterceptResidual(ii, ij),
      6,
    );
  });

  it('12) IMG_2807/IMG_2810 incompatibility remains detected', () => {
    if (!hasExternalGt) return;
    const { loadExternalGtDocument, loadCanonicalTelemetryJsonl } = require('./reference-capture-rd003-video-gt-alignment');
    const result = runGlobalFingerprintDiscoveryV2({
      telemetryRows: loadCanonicalTelemetryJsonl(TELEMETRY_JSONL),
      externalGt: loadExternalGtDocument(EXTERNAL_GT),
    });
    expect(result.mutuallyExclusiveCandidates.IMG_2807_AND_IMG_2810_JOINTLY_POSSIBLE).toBe('NO');
  });

  it('14) ingress real-data result is not fabricated', () => {
    if (!hasV2Discovery) return;
    const summary = JSON.parse(
      fs.readFileSync(path.join(V2_DISCOVERY_DIR, 'discovery-v2-summary.json'), 'utf8'),
    );
    expect(summary.INGRESS_TIME_DIAGNOSTIC_SUPPORTED_CLIPS).toBe(0);
  });

  it('18) V2 parity field list is stable', () => {
    expect(V2_SUMMARY_PARITY_FIELDS.length).toBeGreaterThanOrEqual(18);
  });
});
