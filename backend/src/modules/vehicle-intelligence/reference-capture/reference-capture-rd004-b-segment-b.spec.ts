import * as fs from 'fs';
import * as path from 'path';
import {
  APPROXIMATE_NON_UNIQUE_LANDMARK_CANNOT_DEFINE_PROVIDER_CLOCK_OFFSET,
  TRUE_LOCAL_PEAK_ATTENUATION_DOES_NOT_USE_SAME_TIMESTAMP_PROXY,
  buildQualifiedHfSpeedSeries,
  loadRd004Jsonl,
  type QualifiedSpeedPoint,
} from './reference-capture-rd004-a-segment-a';
import {
  SEGMENT_B_CLOCK_LANDMARKS,
  SEGMENT_B_CONSTANTS,
  SEGMENT_B_VIDEO_SPEED_ANCHORS,
  estimateSegmentBClockAlignment,
  matchClockLandmarks,
  matchVideoSpeedAnchor,
  runRd004SegmentBAnalysis,
} from './reference-capture-rd004-b-segment-b';

const SOURCE_OBS = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd004-segment-b/source-observations.jsonl',
);
const SOURCE_SIDECAR = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd004-segment-b/source-legacy-preprocessed-speed-sidecar.jsonl',
);

const hasSourceData = fs.existsSync(SOURCE_OBS) && fs.existsSync(SOURCE_SIDECAR);

describe('DI-EV-0035B RD004-B Segment B validation', () => {
  it('1) preserves A.2 invariant: approximate landmarks cannot define provider offset alone', () => {
    expect(APPROXIMATE_NON_UNIQUE_LANDMARK_CANNOT_DEFINE_PROVIDER_CLOCK_OFFSET).toBe('YES');
    const approximateOnly = matchClockLandmarks(
      SEGMENT_B_CLOCK_LANDMARKS.filter((l) => l.id === 'CLK-B4'),
      [
        {
          anchorId: 'B17',
          status: 'MATCHED',
          videoRelativeSeconds: 690,
          videoSpeedKmh: 51,
          videoAnchorConfidence: 'MEDIUM',
          providerTimestamp: '2026-09-04T03:58:00.000Z',
          providerSpeedKmh: 50,
          telemetryVideoRelativeSeconds: 700,
          rawTimeDisplacementSeconds: 10,
          speedErrorKmh: -1,
          candidateOffsetSeconds: 10,
          matchConfidence: 'MEDIUM',
          localShapeAgreement: 'PARTIAL',
          cadenceContextSeconds: 12,
        },
      ],
    );
    expect(approximateOnly[0]!.CLOCK_FIT_ELIGIBLE).toBe('NO');
  });

  it('2) never derives video expected time from telemetry in anchor matching', () => {
    const points: QualifiedSpeedPoint[] = [
      { acquisitionOrdinal: 1, providerTimestamp: '2026-09-04T03:48:02.000Z', speedKmh: 17, videoRelativeSecondsProvisional: 60, flags: [] },
      { acquisitionOrdinal: 2, providerTimestamp: '2026-09-04T03:49:02.000Z', speedKmh: 57, videoRelativeSecondsProvisional: 120, flags: [] },
    ];
    const anchor = SEGMENT_B_VIDEO_SPEED_ANCHORS.find((a) => a.id === 'B01')!;
    const match = matchVideoSpeedAnchor(anchor, points);
    expect(match.status).toBe('MATCHED');
    expect(match.candidateOffsetSeconds).toBe(0);
    expect(match.videoRelativeSeconds).toBe(60);
  });

  it('3) one telemetry episode cannot count as multiple clock landmarks', () => {
    const matches = matchClockLandmarks(SEGMENT_B_CLOCK_LANDMARKS, [
      {
        anchorId: 'B15',
        status: 'MATCHED',
        videoRelativeSeconds: 630,
        videoSpeedKmh: 0,
        videoAnchorConfidence: 'HIGH',
        providerTimestamp: 't1',
        providerSpeedKmh: 0,
        telemetryVideoRelativeSeconds: 640,
        rawTimeDisplacementSeconds: 10,
        speedErrorKmh: 0,
        candidateOffsetSeconds: 10,
        matchConfidence: 'HIGH',
        localShapeAgreement: 'GOOD',
        cadenceContextSeconds: 8,
      },
      {
        anchorId: 'B16',
        status: 'MATCHED',
        videoRelativeSeconds: 660,
        videoSpeedKmh: 0,
        videoAnchorConfidence: 'HIGH',
        providerTimestamp: 't1',
        providerSpeedKmh: 0,
        telemetryVideoRelativeSeconds: 640,
        rawTimeDisplacementSeconds: -20,
        speedErrorKmh: 0,
        candidateOffsetSeconds: -20,
        matchConfidence: 'HIGH',
        localShapeAgreement: 'GOOD',
        cadenceContextSeconds: 8,
      },
    ]);
    const eligible = matches.filter((m) => m.CLOCK_FIT_ELIGIBLE === 'YES');
    expect(eligible.length).toBeLessThanOrEqual(1);
  });

  it('4) provider offset may remain null when spread is too large', () => {
    const clock = estimateSegmentBClockAlignment([
      { landmarkId: 'A', CLOCK_FIT_ELIGIBLE: 'YES', candidateOffsetSeconds: 0, videoRelativeSecondsObserved: 100 },
      { landmarkId: 'B', CLOCK_FIT_ELIGIBLE: 'YES', candidateOffsetSeconds: 50, videoRelativeSecondsObserved: 800 },
      { landmarkId: 'C', CLOCK_FIT_ELIGIBLE: 'YES', candidateOffsetSeconds: -20, videoRelativeSecondsObserved: 500 },
    ]);
    expect(clock.PROVIDER_TIMESTAMP_OFFSET_VALIDATED).toBe('NO');
    expect(clock.VIDEO_TO_PROVIDER_OFFSET_SECONDS).toBeNull();
  });

  it('5) true local peak attenuation invariant preserved from A.2', () => {
    expect(TRUE_LOCAL_PEAK_ATTENUATION_DOES_NOT_USE_SAME_TIMESTAMP_PROXY).toBe('YES');
  });

  it('6) video absolute anchor is independent of provider offset validation', () => {
    const result = runRd004SegmentBAnalysis({ observations: [], legacySidecar: [] });
    expect(result.flags.VIDEO_ABSOLUTE_TIME_ANCHORED).toBe('YES');
    expect(SEGMENT_B_CONSTANTS.independentClockAnchorUtc).toBe('2026-09-04T03:47:02.000Z');
  });

  it('7) no production runtime mutation flags', () => {
    const result = runRd004SegmentBAnalysis({ observations: [], legacySidecar: [] });
    expect(result.flags.PRODUCTION_SCORE_CHANGED).toBe('NO');
    expect(result.flags.PRODUCTION_DETECTORS_CHANGED).toBe('NO');
    expect(result.flags.REFERENCE_CAPTURE_RUNTIME_CHANGED).toBe('NO');
    expect(result.flags.DEPLOYED).toBe('NO');
  });

  it('8) segment A evidence completeness flag preserved', () => {
    const result = runRd004SegmentBAnalysis({ observations: [], legacySidecar: [] });
    expect(result.flags.RD004_SEGMENT_A_COMPLETE).toBe('YES');
    expect(result.flags.RD004_SEGMENT_B_COMPLETE).toBe('YES');
  });

  (hasSourceData ? it : it.skip)('9) sealed Segment B analysis on committed envelope data', () => {
    const observations = loadRd004Jsonl(fs.readFileSync(SOURCE_OBS, 'utf8'));
    const legacySidecar = fs
      .readFileSync(SOURCE_SIDECAR, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const result = runRd004SegmentBAnalysis({ observations, legacySidecar });
    expect(result.evidenceId).toBe('DI-EV-0035B');
    expect(result.flags.HF_SPEED_ROWS).toBeGreaterThan(50);
    expect(result.flags.VIDEO_ABSOLUTE_TIME_ANCHORED).toBe('YES');
    expect(result.flags.REVERSE_VIDEO_OBSERVED).toBe('YES');
    expect(result.flags.REVERSE_VIDEO_TIME_HIGH_CONFIDENCE).toBe('YES');
    expect(result.flags.EXACT_OR_HIGH_CONFIDENCE_VIDEO_SPEED_ANCHORS_ACCEPTED).toBeGreaterThan(15);
    expect(result.flags.TRUE_LOCAL_PEAK_ATTENUATION_DOES_NOT_USE_SAME_TIMESTAMP_PROXY).toBe('YES');
    expect(result.speedAccuracy.SPEED_MAE_KMH).not.toBeNull();
  });

  (hasSourceData ? it : it.skip)('10) segment B HF cadence compared against segment A reference', () => {
    const observations = loadRd004Jsonl(fs.readFileSync(SOURCE_OBS, 'utf8'));
    const legacySidecar = fs
      .readFileSync(SOURCE_SIDECAR, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const result = runRd004SegmentBAnalysis({ observations, legacySidecar });
    expect(result.segmentAComparison.SEGMENT_A_B_CADENCE_COMPARISON).toBeDefined();
    expect(result.segmentAComparison.segmentA.HF_SPEED_ROWS).toBe(38);
  });
});
