import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  CANONICAL_TELEMETRY_JSONL_SHA256,
  makeTelemetryRow,
} from './reference-capture-rd003-video-gt-alignment';
import { externalGtDocumentSha256, buildExternalGtDocument } from './reference-capture-rd003-video-gt-external-observations';
import { artifactSha256 } from './reference-capture-rd003-video-gt-global-discovery-v2';
import {
  buildSignalSurfaceQualityMatrix,
  deriveJerkFromAcceleration,
  deriveLongitudinalAccelerationFromSpeed,
  identifyStaleHoldDuplicateRows,
  rowsForPhysicalCadenceAnalysis,
  runRd003SignalQualityInterpretation,
  SIGNAL_QUALITY_EVIDENCE_ID,
  buildGearDirectionQuality,
  getCruiseSpeedGtObservations,
  resolveNegativeControlCruiseWindow,
  SIGNAL_QUALITY_CLOSEOUT_REVISION,
} from './reference-capture-rd003-signal-quality';
import { buildSpeedSeries } from './reference-capture-rd003-video-gt-alignment';

const EXTERNAL_GT = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd003-video-ground-truth-observations.json',
);
const TELEMETRY_JSONL = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/dimo-lte-r1-reference-drive-003-video-gt-correlation-source.jsonl',
);
const SIGNAL_QUALITY_DIR = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd003-signal-quality',
);
const V2_DISCOVERY_DIR = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd003-video-gt-alignment/global-fingerprint-discovery-v2',
);
const HARD_PRIOR_DIR = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd003-video-gt-alignment/hard-clock-prior-run',
);
const V1_DISCOVERY_DIR = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd003-video-gt-alignment/global-fingerprint-discovery',
);

const hasExternalGt = fs.existsSync(EXTERNAL_GT);
const hasTelemetry = fs.existsSync(TELEMETRY_JSONL);
const hasSignalQuality = fs.existsSync(path.join(SIGNAL_QUALITY_DIR, 'signal-quality-summary.json'));

describe('DI-EV-0034E signal quality interpretation', () => {
  it('1) providerTimestamp and synqReceivedAt remain separate in surface matrix', () => {
    const rows = [
      makeTelemetryRow({
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-02T19:00:00.000Z',
        synqReceivedAt: '2026-09-02T19:00:07.000Z',
        physicalSampleFingerprint: 'fp-a',
        rawValueJson: 50,
      }),
    ];
    const matrix = buildSignalSurfaceQualityMatrix(rows);
    const entry = matrix.speed.HF_HISTORICAL as Record<string, unknown>;
    expect(entry.BEST_AVAILABLE_PHYSICAL_EVENT_TIME_AUTHORITY).toBe('providerTimestamp');
    expect(entry.DELIVERY_TIME_ONLY).toBe('synqReceivedAt');
    expect(entry.SESSION_SPAN_COVERAGE).toBeDefined();
    expect(entry.SESSION_COVERAGE).toBeUndefined();
    expect(entry.freshnessEvaluatedFromProviderMetrics).toBe('YES');
    expect(entry.freshnessEvaluatedBySurfaceName).toBeUndefined();
  });

  it('2) duplicate physical samples do not inflate cadence', () => {
    const fp = 'same-fp';
    const rows = [
      makeTelemetryRow({
        acquisitionOrdinal: 1,
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-02T19:00:00.000Z',
        synqReceivedAt: '2026-09-02T19:00:01.000Z',
        physicalSampleFingerprint: fp,
        rawValueJson: 60,
      }),
      makeTelemetryRow({
        acquisitionOrdinal: 2,
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-02T19:00:00.000Z',
        synqReceivedAt: '2026-09-02T19:00:06.000Z',
        physicalSampleFingerprint: fp,
        rawValueJson: 60,
      }),
      makeTelemetryRow({
        acquisitionOrdinal: 3,
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-02T19:00:02.000Z',
        synqReceivedAt: '2026-09-02T19:00:08.000Z',
        physicalSampleFingerprint: 'fp-b',
        rawValueJson: 62,
      }),
    ];
    const physical = rowsForPhysicalCadenceAnalysis(rows);
    expect(physical.length).toBe(2);
    const dupes = identifyStaleHoldDuplicateRows(rows);
    expect(dupes.size).toBe(1);
  });

  it('3) stale holds excluded from physical cadence calculations', () => {
    const rows = [
      makeTelemetryRow({
        providerField: 'speed',
        acquisitionSurface: 'LATEST_LIVE',
        providerTimestamp: '2026-09-02T19:00:00.000Z',
        synqReceivedAt: '2026-09-02T19:00:01.000Z',
        physicalSampleFingerprint: 'hold-fp',
        rawValueJson: 40,
      }),
      makeTelemetryRow({
        providerField: 'speed',
        acquisitionSurface: 'LATEST_LIVE',
        providerTimestamp: '2026-09-02T19:00:00.000Z',
        synqReceivedAt: '2026-09-02T19:00:30.000Z',
        physicalSampleFingerprint: 'hold-fp',
        rawValueJson: 40,
      }),
    ];
    const matrix = buildSignalSurfaceQualityMatrix(rows);
    const cadence = (matrix.speed.LATEST_LIVE as Record<string, unknown>).NEW_PHYSICAL_SAMPLE_CADENCE as Record<string, unknown>;
    expect(cadence.staleHoldDuplicatesExcludedFromCadence).toBe('YES');
    expect(cadence.medianSeconds).toBeNull();
  });

  it('4) acceleration uses true providerTimestamp delta-t', () => {
    const rows = [
      makeTelemetryRow({
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-02T19:00:00.000Z',
        synqReceivedAt: '2026-09-02T19:00:01.000Z',
        physicalSampleFingerprint: 'a',
        rawValueJson: 36,
      }),
      makeTelemetryRow({
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-02T19:00:02.000Z',
        synqReceivedAt: '2026-09-02T19:00:03.000Z',
        physicalSampleFingerprint: 'b',
        rawValueJson: 43.2,
      }),
    ];
    const series = buildSpeedSeries(rows);
    const accel = deriveLongitudinalAccelerationFromSpeed({ speedSeries: series, maxGapSeconds: 3 });
    expect(accel[0]!.deltaTSec).toBeCloseTo(2, 6);
    expect(accel[0]!.accelerationMps2).toBeCloseTo(1, 3);
  });

  it('5) invalid / large delta-t is gated', () => {
    const rows = [
      makeTelemetryRow({
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-02T19:00:00.000Z',
        synqReceivedAt: '2026-09-02T19:00:01.000Z',
        physicalSampleFingerprint: 'a',
        rawValueJson: 30,
      }),
      makeTelemetryRow({
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-02T19:00:10.000Z',
        synqReceivedAt: '2026-09-02T19:00:11.000Z',
        physicalSampleFingerprint: 'b',
        rawValueJson: 50,
      }),
    ];
    const series = buildSpeedSeries(rows);
    const accel = deriveLongitudinalAccelerationFromSpeed({ speedSeries: series, maxGapSeconds: 2 });
    expect(accel[0]!.reliable).toBe(false);
    expect(accel[0]!.rejectionReason).toBe('GAP_EXCEEDS_POLICY');
  });

  it('6) acceleration not manufactured across stale holds', () => {
    const rows = [
      makeTelemetryRow({
        acquisitionOrdinal: 10,
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-02T19:00:00.000Z',
        synqReceivedAt: '2026-09-02T19:00:01.000Z',
        physicalSampleFingerprint: 'stale',
        rawValueJson: 40,
      }),
      makeTelemetryRow({
        acquisitionOrdinal: 11,
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-02T19:00:00.000Z',
        synqReceivedAt: '2026-09-02T19:00:20.000Z',
        physicalSampleFingerprint: 'stale',
        rawValueJson: 40,
      }),
      makeTelemetryRow({
        acquisitionOrdinal: 12,
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-02T19:00:02.000Z',
        synqReceivedAt: '2026-09-02T19:00:03.000Z',
        physicalSampleFingerprint: 'fresh',
        rawValueJson: 45,
      }),
    ];
    const series = buildSpeedSeries(rows);
    const staleDupes = identifyStaleHoldDuplicateRows(rows);
    expect(staleDupes.has(11)).toBe(true);
    const accel = deriveLongitudinalAccelerationFromSpeed({
      speedSeries: series,
      maxGapSeconds: 5,
      staleHoldDuplicateOrdinals: staleDupes,
    });
    expect(accel.some((p) => p.rejectionReason === 'STALE_HOLD_DUPLICATE')).toBe(true);
  });

  it('7) jerk uses only cadence-qualified acceleration points', () => {
    const accel = [
      { utcMs: 1000, accelerationMps2: 0, deltaTSec: 1, deltaVKmh: 0, reliable: true, rejectionReason: null },
      { utcMs: 2000, accelerationMps2: 1, deltaTSec: 1, deltaVKmh: 3.6, reliable: true, rejectionReason: null },
      { utcMs: 3000, accelerationMps2: 2, deltaTSec: 1, deltaVKmh: 3.6, reliable: false, rejectionReason: 'GAP_EXCEEDS_POLICY' },
      { utcMs: 4000, accelerationMps2: 3, deltaTSec: 1, deltaVKmh: 3.6, reliable: true, rejectionReason: null },
    ];
    const jerk = deriveJerkFromAcceleration(accel);
    expect(jerk.length).toBe(2);
    expect(jerk.every((j) => j.reliable)).toBe(true);
  });

  it('8) throttle and TPS remain separate signals', () => {
    if (!hasTelemetry) return;
    const { loadCanonicalTelemetryJsonl } = require('./reference-capture-rd003-video-gt-alignment');
    const rows = loadCanonicalTelemetryJsonl(TELEMETRY_JSONL);
    const matrix = buildSignalSurfaceQualityMatrix(rows);
    expect(matrix.obdThrottlePosition).toBeDefined();
    expect(matrix.powertrainCombustionEngineTPS).toBeDefined();
    expect(matrix.obdThrottlePosition).not.toBe(matrix.powertrainCombustionEngineTPS);
  });

  it('9) engine load is not labelled vehicle mass/payload', () => {
    if (!hasExternalGt || !hasTelemetry) return;
    const { loadExternalGtDocument, loadCanonicalTelemetryJsonl } = require('./reference-capture-rd003-video-gt-alignment');
    const result = runRd003SignalQualityInterpretation({
      telemetryRows: loadCanonicalTelemetryJsonl(TELEMETRY_JSONL),
      externalGt: loadExternalGtDocument(EXTERNAL_GT),
    });
    expect(result.powertrainSignalCorrelation.ENGINE_LOAD_INTERPRETATION).toContain('not vehicle mass');
    expect(result.signalQualitySummary.SIGNALS_NOT_SAFE_AS_DIRECT_SCORE_INPUT).toEqual(
      expect.arrayContaining([expect.stringMatching(/obdEngineLoad|mass/i)]),
    );
  });

  it('10) gear state and gear timing capability remain separate', () => {
    if (!hasExternalGt || !hasTelemetry) return;
    const { loadExternalGtDocument, loadCanonicalTelemetryJsonl } = require('./reference-capture-rd003-video-gt-alignment');
    const gear = buildGearDirectionQuality({
      externalGt: loadExternalGtDocument(EXTERNAL_GT),
      telemetryRows: loadCanonicalTelemetryJsonl(TELEMETRY_JSONL),
    });
    expect(gear.GEAR_STATE_OBSERVABILITY).toBe('YES');
    expect(gear.GEAR_CHANGE_TIMING_OBSERVABILITY).toBe('NO');
    expect(gear.PRECISE_SHIFT_TIMING_USEFUL).toBe('NO');
  });

  it('11) unsigned speed alone cannot infer direction', () => {
    if (!hasExternalGt || !hasTelemetry) return;
    const { loadExternalGtDocument, loadCanonicalTelemetryJsonl } = require('./reference-capture-rd003-video-gt-alignment');
    const gear = buildGearDirectionQuality({
      externalGt: loadExternalGtDocument(EXTERNAL_GT),
      telemetryRows: loadCanonicalTelemetryJsonl(TELEMETRY_JSONL),
    });
    expect(gear.UNSIGNED_SPEED_CANNOT_INFER_DIRECTION).toBe('YES');
    const img2811 = gear.IMG_2811_DIRECTION as Record<string, unknown>;
    expect(img2811.directionFromUnsignedSpeedAlone).toBe('NOT_IDENTIFIABLE');
  });

  it('12) no production Driving Score values are modified', () => {
    const scorerPath = path.resolve(
      __dirname,
      '../driving-impact/driving-impact-scorer.ts',
    );
    expect(fs.existsSync(scorerPath)).toBe(true);
    const content = fs.readFileSync(scorerPath, 'utf8');
    expect(content).not.toContain('DI-EV-0034E');
  });

  it('13) external GT SHA unchanged', () => {
    const doc = buildExternalGtDocument();
    expect(externalGtDocumentSha256(doc)).toBe(
      'ea0d78ee71b5c83f104e8de31056ccfccc7b476733b676da5bf8828badc9592e',
    );
  });

  it('14) DI-EV-0033 canonical SHA unchanged', () => {
    expect(CANONICAL_TELEMETRY_JSONL_SHA256).toBe(
      '69209a6d9e488d51c3aaf3b55dee5584ce622dc072a191b81e7061597cdda87a',
    );
  });

  it('15) DI-EV-0034B/C/D artifacts unchanged', () => {
    const v2Summary = fs.readFileSync(path.join(V2_DISCOVERY_DIR, 'discovery-v2-summary.json'), 'utf8');
    expect(JSON.parse(v2Summary).evidenceRevision).toBe('DI-EV-0034D.2');
    const v1Summary = fs.readFileSync(path.join(V1_DISCOVERY_DIR, 'discovery-summary.json'), 'utf8');
    expect(JSON.parse(v1Summary).evidenceId).toBe('DI-EV-0034C');
    const hardManifest = JSON.parse(
      fs.readFileSync(path.join(HARD_PRIOR_DIR, 'hard-clock-prior-manifest.json'), 'utf8'),
    ) as { artifactSha256: Record<string, string> };
    const hardSummary = fs.readFileSync(path.join(HARD_PRIOR_DIR, 'alignment-summary.json'), 'utf8');
    expect(hardManifest.artifactSha256['alignment-summary.json']).toBe(artifactSha256(hardSummary));
  });

  it('16) analysis output deterministic', () => {
    if (!hasExternalGt || !hasTelemetry) return;
    const { loadExternalGtDocument, loadCanonicalTelemetryJsonl } = require('./reference-capture-rd003-video-gt-alignment');
    const externalGt = loadExternalGtDocument(EXTERNAL_GT);
    const telemetryRows = loadCanonicalTelemetryJsonl(TELEMETRY_JSONL);
    const a = runRd003SignalQualityInterpretation({ telemetryRows, externalGt });
    const b = runRd003SignalQualityInterpretation({ telemetryRows, externalGt });
    const hashA = crypto.createHash('sha256').update(JSON.stringify(a.signalQualitySummary)).digest('hex');
    const hashB = crypto.createHash('sha256').update(JSON.stringify(b.signalQualitySummary)).digest('hex');
    expect(hashA).toBe(hashB);
  });

  it('17) committed summary parity with fresh run', () => {
    if (!hasExternalGt || !hasTelemetry || !hasSignalQuality) return;
    const { loadExternalGtDocument, loadCanonicalTelemetryJsonl, stableStringify } = require('./reference-capture-rd003-video-gt-alignment');
    const committed = JSON.parse(
      fs.readFileSync(path.join(SIGNAL_QUALITY_DIR, 'signal-quality-summary.json'), 'utf8'),
    );
    const fresh = runRd003SignalQualityInterpretation({
      telemetryRows: loadCanonicalTelemetryJsonl(TELEMETRY_JSONL),
      externalGt: loadExternalGtDocument(EXTERNAL_GT),
    }).signalQualitySummary;
    expect(stableStringify(committed.humanSummary)).toBe(stableStringify(fresh.humanSummary));
    expect(committed.evidenceId).toBe(SIGNAL_QUALITY_EVIDENCE_ID);
  });
});

describe('DI-EV-0034E.1 signal quality correctness closeout', () => {
  it('E.1a) alignment-fit MAE is not labelled independent absolute accuracy', () => {
    if (!hasExternalGt || !hasTelemetry) return;
    const { loadExternalGtDocument, loadCanonicalTelemetryJsonl } = require('./reference-capture-rd003-video-gt-alignment');
    const result = runRd003SignalQualityInterpretation({
      telemetryRows: loadCanonicalTelemetryJsonl(TELEMETRY_JSONL),
      externalGt: loadExternalGtDocument(EXTERNAL_GT),
    });
    expect(result.speedVideoValidation.IN_SAMPLE_ALIGNMENT_FIT_NOT_INDEPENDENT_ACCURACY).toBe('YES');
    expect(result.signalQualitySummary.HF_SPEED_ALIGNMENT_FIT_MAE_KMH).not.toBeNull();
    expect(result.signalQualitySummary.HF_SPEED_WITHIN_CLIP_HOLDOUT_MAE_KMH).not.toBeNull();
    expect(result.signalQualitySummary.HF_SPEED_INDEPENDENT_ABSOLUTE_ACCURACY_MAE_KMH).toBeNull();
    expect(result.signalQualitySummary.HF_SPEED_INDEPENDENT_ACCURACY_MAE_KMH).toBeUndefined();
    expect(result.signalQualitySummary.INDEPENDENT_ABSOLUTE_ACCURACY_VALIDATED).toBe('NO');
    expect(result.signalQualitySummary.WITHIN_CLIP_HOLDOUT_IMPROVES_GENERALIZATION_EVIDENCE).toBe('YES');
  });

  it('E.1b) negative control scores only cruise-window GT observations', () => {
    if (!hasExternalGt) return;
    const { loadExternalGtDocument } = require('./reference-capture-rd003-video-gt-alignment');
    const externalGt = loadExternalGtDocument(EXTERNAL_GT);
    const clip2809 = externalGt.clips.find((c: { fileName: string }) => c.fileName === 'IMG_2809.mp4')!;
    const window = resolveNegativeControlCruiseWindow(clip2809)!;
    expect(window.toSeconds).toBeLessThanOrEqual(18);
    const cruiseObs = getCruiseSpeedGtObservations(clip2809);
    expect(cruiseObs.every((o) => (o.videoTimeSeconds ?? 0) <= window.toSeconds)).toBe(true);
    expect(cruiseObs.some((o) => (o.videoTimeSeconds ?? 0) > 20)).toBe(false);
  });

  it('E.1c) acceleration uses distribution semantics not noise', () => {
    if (!hasExternalGt || !hasTelemetry) return;
    const { loadExternalGtDocument, loadCanonicalTelemetryJsonl } = require('./reference-capture-rd003-video-gt-alignment');
    const result = runRd003SignalQualityInterpretation({
      telemetryRows: loadCanonicalTelemetryJsonl(TELEMETRY_JSONL),
      externalGt: loadExternalGtDocument(EXTERNAL_GT),
    });
    const policy = (result.derivedAccelerationQuality.policies as Record<string, Record<string, unknown>>)['maxGap_2s'];
    expect(policy.accelerationDistributionStdMps2).toBeDefined();
    expect(policy.accelerationNoiseStdMps2).toBeUndefined();
    expect(policy.qualifiedPointFraction).toBeDefined();
    expect(result.derivedAccelerationQuality.PROVISIONAL_CANDIDATE_MAX_GAP).toContain('ANALYSIS_ONLY');
  });

  it('E.1d) LATEST_LIVE direct video validation is insufficient evidence', () => {
    if (!hasExternalGt || !hasTelemetry) return;
    const { loadExternalGtDocument, loadCanonicalTelemetryJsonl } = require('./reference-capture-rd003-video-gt-alignment');
    const result = runRd003SignalQualityInterpretation({
      telemetryRows: loadCanonicalTelemetryJsonl(TELEMETRY_JSONL),
      externalGt: loadExternalGtDocument(EXTERNAL_GT),
    });
    expect(result.signalQualitySummary.LATEST_LIVE_DIRECT_VIDEO_VALIDATION).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.signalQualitySummary.LATEST_LIVE_GENERAL_DATA_UTILITY).toBe('CONTEXT_WITH_FRESHNESS_GATING');
    expect(result.signalQualitySummary.LATEST_LIVE_SPEED_USEFULNESS).toBeUndefined();
  });

  it('E.1e) signal classifications include evidence basis and limitation', () => {
    if (!hasExternalGt || !hasTelemetry) return;
    const { loadExternalGtDocument, loadCanonicalTelemetryJsonl } = require('./reference-capture-rd003-video-gt-alignment');
    const result = runRd003SignalQualityInterpretation({
      telemetryRows: loadCanonicalTelemetryJsonl(TELEMETRY_JSONL),
      externalGt: loadExternalGtDocument(EXTERNAL_GT),
    });
    const cls = result.signalQualitySummary.signalClassifications as Record<string, { RATING: string; EVIDENCE_BASIS: string; LIMITATION: string }>;
    expect(cls.SPEED.EVIDENCE_BASIS).toContain('alignment-fit');
    expect(cls.SPEED.LIMITATION).toContain('IN_SAMPLE');
    expect(cls.SPEED.EVIDENCE_BASIS).toContain('1 evaluated holdout clip');
    expect(cls.SPEED.EVIDENCE_BASIS).not.toMatch(/across 2 clips/);
    expect(cls.SPEED.EVIDENCE_BASIS).not.toMatch(/across 2 evaluated holdout clips/);
    expect(result.signalQualitySummary.UNIQUE_ALIGNMENT_SUPPORTED_CLIPS).toBe(2);
    expect(result.signalQualitySummary.UNIQUE_ALIGNMENT_HOLDOUT_CLIPS).toBe(1);
    expect(cls.PROVIDER_TIMESTAMP.RATING).toBe('BEST_AVAILABLE_PHYSICAL_EVENT_TIME_AUTHORITY');
    expect(result.signalQualitySummary.closeoutRevision).toBe(SIGNAL_QUALITY_CLOSEOUT_REVISION);
  });

  it('E.1f) holdout validation reported separately from alignment fit', () => {
    if (!hasExternalGt || !hasTelemetry) return;
    const { loadExternalGtDocument, loadCanonicalTelemetryJsonl } = require('./reference-capture-rd003-video-gt-alignment');
    const result = runRd003SignalQualityInterpretation({
      telemetryRows: loadCanonicalTelemetryJsonl(TELEMETRY_JSONL),
      externalGt: loadExternalGtDocument(EXTERNAL_GT),
    });
    expect(Array.isArray(result.speedVideoValidation.holdoutValidation)).toBe(true);
    expect(Array.isArray(result.speedVideoValidation.UNIQUE_ALIGNMENT_HOLDOUT_RESULTS)).toBe(true);
    expect(Array.isArray(result.speedVideoValidation.AMBIGUOUS_ALIGNMENT_HOLDOUT_DIAGNOSTICS)).toBe(true);
    expect(result.signalQualitySummary.UNIQUE_ALIGNMENT_HOLDOUT_CLIPS).toBe(1);
    expect(result.signalQualitySummary.AMBIGUOUS_ALIGNMENT_HOLDOUT_CLIPS).toBe(6);
    expect(result.signalQualitySummary.UNIQUE_ALIGNMENT_SUPPORTED_CLIPS).toBe(2);
  });

  it('E.1g) negative controls are diagnostic-only under ambiguous alignment', () => {
    if (!hasExternalGt || !hasTelemetry) return;
    const { loadExternalGtDocument, loadCanonicalTelemetryJsonl } = require('./reference-capture-rd003-video-gt-alignment');
    const result = runRd003SignalQualityInterpretation({
      telemetryRows: loadCanonicalTelemetryJsonl(TELEMETRY_JSONL),
      externalGt: loadExternalGtDocument(EXTERNAL_GT),
    });
    expect(result.signalQualitySummary.NEGATIVE_CONTROL_UNIQUE_ALIGNMENT_VALIDATED).toBe('NO');
    const nc = result.speedVideoValidation.negativeControls as Array<Record<string, unknown>>;
    const img2804 = nc.find((n) => n.fileName === 'IMG_2804.mp4');
    expect(img2804?.NEGATIVE_CONTROL_AUTHORITY).toBe('DIAGNOSTIC_ONLY_AMBIGUOUS_ALIGNMENT');
  });

  it('E.1h) powertrain unique vs ambiguous diagnostics reported separately', () => {
    if (!hasExternalGt || !hasTelemetry) return;
    const { loadExternalGtDocument, loadCanonicalTelemetryJsonl } = require('./reference-capture-rd003-video-gt-alignment');
    const result = runRd003SignalQualityInterpretation({
      telemetryRows: loadCanonicalTelemetryJsonl(TELEMETRY_JSONL),
      externalGt: loadExternalGtDocument(EXTERNAL_GT),
    });
    expect(result.powertrainSignalCorrelation.UNIQUE_ALIGNMENT_EPISODES).toBe(2);
    expect(result.powertrainSignalCorrelation.AMBIGUOUS_ALIGNMENT_DIAGNOSTIC_EPISODES).toBe(6);
    const rpm = (
      result.powertrainSignalCorrelation.aggregateDiagnostics as Record<string, Record<string, unknown>>
    ).powertrainCombustionEngineSpeed;
    expect(rpm.UNIQUE_ALIGNMENT_MEAN_EVENT_DIRECTION_AGREEMENT).not.toBeNull();
    expect(rpm.AMBIGUOUS_DIAGNOSTIC_MEAN_EVENT_DIRECTION_AGREEMENT).not.toBeNull();
    const rpmBasis = (
      result.signalQualitySummary.signalClassifications as Record<string, { EVIDENCE_BASIS: string }>
    ).RPM.EVIDENCE_BASIS;
    expect(rpmBasis).toContain('unique-alignment');
    expect(rpmBasis).toContain('ambiguous-diagnostic');
  });
});
