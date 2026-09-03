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
    expect(entry.PHYSICAL_EVENT_TIME_AUTHORITY).toBe('providerTimestamp');
    expect(entry.DELIVERY_TIME).toBe('synqReceivedAt');
    expect(entry.PROVIDER_SAMPLE_AGE).toBeDefined();
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
