import * as fs from 'fs';
import * as path from 'path';
import {
  buildQualifiedHfSpeedSeries,
  computeQualifiedAccelerationPairs,
  estimateClockAlignment,
  filterRowsByProviderTimestampEnvelope,
  loadRd004Jsonl,
  matchVideoLandmarks,
  PROVISIONAL_ACCELERATION_MAX_GAP_SECONDS,
  RD004_A_EVIDENCE_ID,
  runRd004SegmentAAnalysis,
  SEGMENT_A_CONSTANTS,
  VIDEO_LANDMARKS,
} from './reference-capture-rd004-a-segment-a';
import { makeTelemetryRow } from './reference-capture-rd003-video-gt-alignment';

const SOURCE_OBS = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd004-segment-a/source-observations.jsonl',
);
const SOURCE_SIDECAR = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd004-segment-a/source-legacy-preprocessed-speed-sidecar.jsonl',
);

const hasSourceData = fs.existsSync(SOURCE_OBS) && fs.existsSync(SOURCE_SIDECAR);

describe('DI-EV-0035A RD004-A Segment A alignment', () => {
  it('1) uses providerTimestamp as physical event-time authority for HF speed', () => {
    const rows = [
      makeTelemetryRow({
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-04T03:37:46.000Z',
        physicalSampleFingerprint: 'fp-a',
        rawValueJson: 10,
        acquisitionOrdinal: 1,
      }),
      makeTelemetryRow({
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-04T03:37:51.000Z',
        physicalSampleFingerprint: 'fp-b',
        rawValueJson: 12,
        acquisitionOrdinal: 2,
      }),
    ];
    const series = buildQualifiedHfSpeedSeries(rows, SEGMENT_A_CONSTANTS.videoStartUtc);
    expect(series).toHaveLength(2);
    expect(series[0]!.videoRelativeSecondsProvisional).toBe(0);
    expect(series[1]!.speedKmh).toBe(12);
  });

  it('2) deduplicates identical physical fingerprints in qualified HF speed', () => {
    const fp = 'same-fp';
    const rows = [
      makeTelemetryRow({
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-04T03:37:46.000Z',
        physicalSampleFingerprint: fp,
        rawValueJson: 20,
        acquisitionOrdinal: 1,
      }),
      makeTelemetryRow({
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-04T03:37:46.000Z',
        physicalSampleFingerprint: fp,
        rawValueJson: 20,
        acquisitionOrdinal: 2,
      }),
    ];
    const series = buildQualifiedHfSpeedSeries(rows, SEGMENT_A_CONSTANTS.videoStartUtc);
    expect(series).toHaveLength(1);
  });

  it('3) marks unqualified acceleration pairs when gap exceeds provisional max', () => {
    const points = [
      {
        acquisitionOrdinal: 1,
        providerTimestamp: '2026-09-04T03:37:46.000Z',
        speedKmh: 0,
        videoRelativeSecondsProvisional: 0,
        flags: [],
      },
      {
        acquisitionOrdinal: 2,
        providerTimestamp: '2026-09-04T03:37:47.000Z',
        speedKmh: 10,
        videoRelativeSecondsProvisional: 1,
        flags: [],
      },
      {
        acquisitionOrdinal: 3,
        providerTimestamp: '2026-09-04T03:37:50.000Z',
        speedKmh: 20,
        videoRelativeSecondsProvisional: 4,
        flags: [],
      },
    ];
    const accel = computeQualifiedAccelerationPairs(points, PROVISIONAL_ACCELERATION_MAX_GAP_SECONDS);
    expect(accel.pairs[0]!.qualified).toBe(true);
    expect(accel.pairs[1]!.qualified).toBe(false);
    expect(accel.pairs[1]!.rejectionReason).toBe('UNQUALIFIED_GAP');
  });

  it('4) preserves RD003 artifacts and does not claim absolute speed validation without exact anchors', () => {
    const result = runRd004SegmentAAnalysis({ observations: [], legacySidecar: [] });
    expect(result.evidenceId).toBe(RD004_A_EVIDENCE_ID);
    expect(result.flags.ABSOLUTE_SPEED_ACCURACY_VALIDATED).toBe('NO');
    expect(result.flags.EXACT_VIDEO_SPEED_ANCHORS).toBe(0);
    expect(result.flags.PRODUCTION_SCORE_CHANGED).toBe('NO');
    expect(result.flags.RD004_WHOLE_DRIVE_COMPLETE).toBe('NO');
    expect(result.flags.SEGMENT_B_PENDING).toBe('YES');
  });

  (hasSourceData ? it : it.skip)(
    '5) runs full Segment-A envelope analysis on sealed RD004 source data',
    () => {
      const observations = loadRd004Jsonl(fs.readFileSync(SOURCE_OBS, 'utf8'));
      const legacySidecar = fs
        .readFileSync(SOURCE_SIDECAR, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const envelope = filterRowsByProviderTimestampEnvelope(
        observations,
        SEGMENT_A_CONSTANTS.queryEnvelopeStartUtc,
        SEGMENT_A_CONSTANTS.queryEnvelopeEndUtc,
      );
      expect(envelope.length).toBeGreaterThan(0);

      const result = runRd004SegmentAAnalysis({ observations, legacySidecar });
      expect(result.flags.HF_HISTORICAL_AVAILABLE).toBe('YES');
      expect(result.qualifiedSpeedSeries.length).toBeGreaterThan(10);
      expect(result.flags.HF_SPEED_MEDIAN_PHYSICAL_CADENCE_SECONDS).toBeGreaterThan(1);
      expect(result.flags.RD004_SEGMENT_A_COMPLETE).toBe('YES');
    },
  );

  (hasSourceData ? it : it.skip)(
    '6) produces landmark matches and clock alignment estimate from real data',
    () => {
      const observations = loadRd004Jsonl(fs.readFileSync(SOURCE_OBS, 'utf8'));
      const legacySidecar = fs
        .readFileSync(SOURCE_SIDECAR, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const result = runRd004SegmentAAnalysis({ observations, legacySidecar });
      const clock = estimateClockAlignment(result.videoClockAlignment.landmarkMatches);
      expect(result.videoClockAlignment.landmarkMatches.length).toBe(VIDEO_LANDMARKS.length);
      expect(clock.VIDEO_PROVIDER_ALIGNMENT_CLASS).toBeDefined();
      expect(result.legacyDetectorAudit.events).toBeDefined();
    },
  );
});
