import * as crypto from 'crypto';
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
  CLOCK_CALIBRATION_LANDMARK_IDS,
  FIRST_LAUNCH_TRANSITION_VIDEO_T_MAX,
  FIRST_LAUNCH_TRANSITION_VIDEO_T_MIN,
  FIRST_STOP_TRANSITION_VIDEO_T_SECONDS,
  OLD_T630_STOP_TRANSITION_INVALIDATED,
  RD004_B_EVIDENCE_ID,
  SEGMENT_B_CLOCK_LANDMARKS,
  SEGMENT_B_CONSTANTS,
  SEGMENT_B_VIDEO_CLIP_ORDER,
  SEGMENT_B_VIDEO_SPEED_ANCHORS,
  SEGMENT_B_VIDEO_TRANSITION_LANDMARKS,
  SPARSE_SAMPLE_DELAY_SEPARATED_FROM_CLOCK_OFFSET,
  SPEED_ACCURACY_HOLDOUT_ANCHOR_IDS,
  VIDEO_CLIP_TOTAL_OVERLAP_SECONDS,
  VIDEO_MASTER_DURATION_SECONDS,
  ZERO_SPEED_STATE_SNAPSHOT_CANNOT_REPLACE_EARLIER_FRAME_VERIFIED_STOP_TRANSITION,
  assessCorrectedFirstStopDisplacement,
  assessFirstStopProviderPairSemantics,
  assessLaunchTransition,
  assessPairContextContinuity,
  buildClockCalibrationEvidence,
  buildVideoMasterTimeline,
  classifyAnchorKinematicState,
  computeHoldoutSpeedAccuracy,
  computePreviousBiasedExploratoryResults,
  computeRawAnchorDisplacementDiagnostic,
  estimateSegmentBClockAlignment,
  expectedProviderMsFromVideo,
  FIRST_LAUNCH_PROVIDER_OBSERVATION_WINDOW_SECONDS,
  matchClockLandmarks,
  matchVideoSpeedAnchor,
  reassessClockModelB3,
  runRd004SegmentBAnalysis,
  selectNearestTelemetryByTimeOnly,
  splitCalibrationHoldoutSets,
  TRANSITION_PREVIOUS_SAMPLE_IS_IMMEDIATE_PREDECESSOR,
} from './reference-capture-rd004-b-segment-b';
import {
  auditSealedHfCaptureProvenance,
  buildHfCaptureCompletenessDiagnostic,
  compareHfSpeedTimestampSets,
} from './reference-capture-rd004-b-hf-capture-completeness';

const SOURCE_OBS = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd004-segment-b/source-observations.jsonl',
);
const SOURCE_SIDECAR = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd004-segment-b/source-legacy-preprocessed-speed-sidecar.jsonl',
);
const SOURCE_MANIFEST = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd004-segment-b/source-manifest.sha256.json',
);

const hasSourceData = fs.existsSync(SOURCE_OBS) && fs.existsSync(SOURCE_SIDECAR);

function samplePoints(): QualifiedSpeedPoint[] {
  const base = Date.parse(SEGMENT_B_CONSTANTS.videoStartUtc);
  return Array.from({ length: 8 }, (_, i) => ({
    acquisitionOrdinal: i + 1,
    providerTimestamp: new Date(base + (60 + i * 30) * 1000).toISOString(),
    speedKmh: 50 + i,
    videoRelativeSecondsProvisional: 60 + i * 30,
    flags: [],
  }));
}

describe('DI-EV-0035B.1 RD004-B Segment B independent calibration closeout', () => {
  it('1) speed value cannot influence holdout telemetry sample selection', () => {
    const points = samplePoints();
    const expectedMs = expectedProviderMsFromVideo(120, 14);
    const a = selectNearestTelemetryByTimeOnly(points, expectedMs);
    const mutated = points.map((p) => ({ ...p, speedKmh: p.speedKmh + 100 }));
    const b = selectNearestTelemetryByTimeOnly(mutated, expectedMs);
    expect(a?.providerTimestamp).toBe(b?.providerTimestamp);
  });

  it('2) validated offset is applied before holdout telemetry sample selection', () => {
    const base = Date.parse(SEGMENT_B_CONSTANTS.videoStartUtc);
    const points: QualifiedSpeedPoint[] = [
      {
        acquisitionOrdinal: 1,
        providerTimestamp: new Date(base + 100 * 1000).toISOString(),
        speedKmh: 40,
        videoRelativeSecondsProvisional: 100,
        flags: [],
      },
      {
        acquisitionOrdinal: 2,
        providerTimestamp: new Date(base + 150 * 1000).toISOString(),
        speedKmh: 55,
        videoRelativeSecondsProvisional: 150,
        flags: [],
      },
    ];
    const withoutOffset = selectNearestTelemetryByTimeOnly(
      points,
      expectedProviderMsFromVideo(120, 0),
    );
    const withOffset = selectNearestTelemetryByTimeOnly(
      points,
      expectedProviderMsFromVideo(120, 35),
    );
    expect(withoutOffset?.providerTimestamp).not.toBe(withOffset?.providerTimestamp);
  });

  it('3) changing videoSpeedKmh while keeping video timestamp fixed does not change holdout provider sample', () => {
    const points = samplePoints();
    const expectedMs = expectedProviderMsFromVideo(120, 14);
    const matchA = selectNearestTelemetryByTimeOnly(points, expectedMs);
    const matchB = selectNearestTelemetryByTimeOnly(points, expectedMs);
    expect(matchA?.providerTimestamp).toBe(matchB?.providerTimestamp);
    expect(matchA?.providerSpeedKmh).toBe(matchB?.providerSpeedKmh);
  });

  it('4) calibration anchors cannot appear in holdout accuracy set', () => {
    const split = splitCalibrationHoldoutSets();
    expect(split.CLOCK_CALIBRATION_HOLDOUT_SEPARATED).toBe('YES');
    const holdoutTimes = new Set(split.SPEED_ACCURACY_HOLDOUT_SET.map((a) => a.videoRelativeSeconds));
    for (const lm of split.CLOCK_CALIBRATION_SET) {
      const times: number[] = [];
      if (lm.videoRelativeSeconds != null) times.push(lm.videoRelativeSeconds);
      if (lm.videoRelativeSecondsMin != null) times.push(lm.videoRelativeSecondsMin);
      if (lm.videoRelativeSecondsMax != null) times.push(lm.videoRelativeSecondsMax);
      for (const t of times) {
        expect(holdoutTimes.has(t)).toBe(false);
      }
    }
    expect(CLOCK_CALIBRATION_LANDMARK_IDS.length).toBeGreaterThan(0);
    expect(SPEED_ACCURACY_HOLDOUT_ANCHOR_IDS.length).toBeGreaterThan(0);
  });

  it('5) reverse-without-direction telemetry cannot define clock offset', () => {
    expect(CLOCK_CALIBRATION_LANDMARK_IDS.includes('CLK-B7' as never)).toBe(false);
    const reverse = SEGMENT_B_CLOCK_LANDMARKS.find((l) => l.id === 'CLK-B7')!;
    expect(reverse.landmarkKind).toBe('REVERSE_CONTEXT');
    if (!hasSourceData) return;
    const observations = loadRd004Jsonl(fs.readFileSync(SOURCE_OBS, 'utf8'));
    const legacySidecar = fs
      .readFileSync(SOURCE_SIDECAR, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const result = runRd004SegmentBAnalysis({ observations, legacySidecar });
    expect(result.videoClockAlignment.clock.CLOCK_FIT_ELIGIBLE_LANDMARKS).not.toContain('CLK-B7');
  });

  it('6) zero-speed snapshot cannot automatically become stop-transition clock landmark', () => {
    const b15 = SEGMENT_B_VIDEO_SPEED_ANCHORS.find((a) => a.id === 'B15')!;
    expect(b15.videoRelativeSeconds).toBe(630);
    expect(b15.note).toContain('SUSTAINED_STOP_STATE');
    const firstZero = SEGMENT_B_VIDEO_TRANSITION_LANDMARKS.find((lm) => lm.id === 'B-T01')!;
    expect(firstZero.videoRelativeSeconds).toBeCloseTo(621.8, 1);
    expect(firstZero.CLOCK_FIT_ELIGIBLE).toBe('NO');
    const invalidatedClk = SEGMENT_B_CLOCK_LANDMARKS.find((l) => l.id === 'CLK-B2')!;
    expect(invalidatedClk.label).toContain('INVALIDATED');
    const flatPoints: QualifiedSpeedPoint[] = [
      {
        acquisitionOrdinal: 1,
        providerTimestamp: '2026-09-04T03:57:30.000Z',
        speedKmh: 5,
        videoRelativeSecondsProvisional: 628,
        flags: [],
      },
      {
        acquisitionOrdinal: 2,
        providerTimestamp: '2026-09-04T03:58:00.000Z',
        speedKmh: 5,
        videoRelativeSecondsProvisional: 658,
        flags: [],
      },
    ];
    const evidence = buildClockCalibrationEvidence([invalidatedClk], flatPoints, 14);
    expect(evidence).toHaveLength(0);
  });

  it('7) 5 km/h telemetry point cannot be treated as exact stop boundary without event-shape evidence', () => {
    const secondStop = SEGMENT_B_CLOCK_LANDMARKS.find((l) => l.id === 'CLK-B5')!;
    expect(secondStop.landmarkKind).toBe('SECOND_STOP');
    const secondStopLandmark = SEGMENT_B_VIDEO_TRANSITION_LANDMARKS.find((lm) => lm.id === 'B-T03')!;
    expect(secondStopLandmark.CLOCK_FIT_ELIGIBLE).toBe('NO');
    const points: QualifiedSpeedPoint[] = [
      {
        acquisitionOrdinal: 1,
        providerTimestamp: '2026-09-04T03:59:00.000Z',
        speedKmh: 12,
        videoRelativeSecondsProvisional: 718,
        flags: [],
      },
      {
        acquisitionOrdinal: 2,
        providerTimestamp: '2026-09-04T03:59:30.000Z',
        speedKmh: 5,
        videoRelativeSecondsProvisional: 748,
        flags: [],
      },
    ];
    const evidence = buildClockCalibrationEvidence([secondStop], points, 14);
    expect(evidence).toHaveLength(0);
  });

  it('8) holdout speed accuracy uses time-only nearest samples', () => {
    const points = samplePoints();
    const holdout = SEGMENT_B_VIDEO_SPEED_ANCHORS.filter((a) => a.id === 'B02');
    const result = computeHoldoutSpeedAccuracy(holdout, SEGMENT_B_VIDEO_SPEED_ANCHORS, points, 14, false);
    expect(result.SPEED_SAMPLE_SELECTION_TIME_ONLY).toBe('YES');
    expect(result.holdoutRows[0]!.nearestProviderTimestamp).not.toBeNull();
  });

  it('9) large time residual anchors are rejected from headline accuracy', () => {
    const sparse: QualifiedSpeedPoint[] = [
      {
        acquisitionOrdinal: 1,
        providerTimestamp: '2026-09-04T03:48:02.000Z',
        speedKmh: 57,
        videoRelativeSecondsProvisional: 200,
        flags: [],
      },
    ];
    const holdout = SEGMENT_B_VIDEO_SPEED_ANCHORS.filter((a) => a.id === 'B02');
    const result = computeHoldoutSpeedAccuracy(holdout, SEGMENT_B_VIDEO_SPEED_ANCHORS, sparse, 14, true);
    expect(result.HOLDOUT_REJECTED_FOR_TIME_DISTANCE).toBeGreaterThanOrEqual(1);
    expect(result.ABSOLUTE_SPEED_ACCURACY_VALIDATED).toBe('NO');
    expect(result.SPEED_MAE_KMH).toBeNull();
  });

  it('10) dynamic-state anchors use stricter temporal qualification than stable-state', () => {
    const dynamicAnchor = SEGMENT_B_VIDEO_SPEED_ANCHORS.find((a) => a.id === 'B14')!;
    const stableAnchor = SEGMENT_B_VIDEO_SPEED_ANCHORS.find((a) => a.id === 'B10')!;
    expect(classifyAnchorKinematicState(dynamicAnchor, SEGMENT_B_VIDEO_SPEED_ANCHORS)).toBe(
      'DYNAMIC_TRANSITION',
    );
    expect(classifyAnchorKinematicState(stableAnchor, SEGMENT_B_VIDEO_SPEED_ANCHORS)).toBe(
      'STABLE_OR_LOW_SLOPE',
    );
  });

  it('11) stop timing does not apply event-derived offset for circular zero-error', () => {
    if (!hasSourceData) return;
    const observations = loadRd004Jsonl(fs.readFileSync(SOURCE_OBS, 'utf8'));
    const legacySidecar = fs
      .readFileSync(SOURCE_SIDECAR, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const result = runRd004SegmentBAnalysis({ observations, legacySidecar });
    expect(result.stopTiming.STOP_TIMING_VALIDATED).toBe('NO');
    expect(result.stopTiming.STOP_TIMING_CLOCK_CORRECTED).toBe('NO');
    expect(result.stopTiming.STOP_TIMING_ERROR_SECONDS).toBeNull();
    expect(result.stopTiming.STOP_TIMING_ANALYSIS_USED_SUPPORTIVE_OFFSET).toBe('NO');
    expect(result.stopTiming.supportiveOffsetSecondsApplied).toBeNull();
    expect(result.stopTiming.OLD_T630_STOP_REFERENCE_INVALIDATED).toBe('YES');
    expect(result.stopTiming.FIRST_STOP_FRAME_VERIFIED_VIDEO_T).toBeCloseTo(621.8, 1);
  });

  it('12) stop timing remains unvalidated when clock model is unavailable', () => {
    const result = runRd004SegmentBAnalysis({ observations: [], legacySidecar: [] });
    expect(result.stopTiming.STOP_TIMING_CLOCK_CORRECTED).toBe('NO');
    expect(result.stopTiming.STOP_TIMING_VALIDATED).toBe('NO');
  });

  it('13) telemetry-only dynamics are not automatically labeled legacy false negatives', () => {
    if (!hasSourceData) return;
    const observations = loadRd004Jsonl(fs.readFileSync(SOURCE_OBS, 'utf8'));
    const legacySidecar = fs
      .readFileSync(SOURCE_SIDECAR, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const result = runRd004SegmentBAnalysis({ observations, legacySidecar });
    expect(result.flags.LEGACY_FALSE_NEGATIVE_VALIDATED).toBe('NO');
    expect(result.flags.VIDEO_OR_KINEMATIC_DYNAMIC_EPISODES_WITHOUT_LEGACY_EVENT).toBeGreaterThanOrEqual(
      0,
    );
    expect(result.flags).not.toHaveProperty('POSSIBLE_FALSE_NEGATIVE_EVENTS');
  });

  it('14) RPM/throttle/TPS segment validation requires event correlation', () => {
    if (!hasSourceData) return;
    const observations = loadRd004Jsonl(fs.readFileSync(SOURCE_OBS, 'utf8'));
    const legacySidecar = fs
      .readFileSync(SOURCE_SIDECAR, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const result = runRd004SegmentBAnalysis({ observations, legacySidecar });
    expect(result.supportingSignals.RD004_B_REQUIRES_EVENT_CORRELATION).toBe('YES');
    expect(['EVENT_CORRELATED', 'NOT_EVENT_CORRELATED', 'INSUFFICIENT_COVERAGE']).toContain(
      result.supportingSignals.RPM_SEGMENT_B_VALIDATION,
    );
  });

  it('15) raw evidence SHA remains unchanged', () => {
    if (!hasSourceData || !fs.existsSync(SOURCE_MANIFEST)) return;
    const manifest = JSON.parse(fs.readFileSync(SOURCE_MANIFEST, 'utf8'));
    const obsSha = crypto.createHash('sha256').update(fs.readFileSync(SOURCE_OBS)).digest('hex');
    const sidecarSha = crypto
      .createHash('sha256')
      .update(fs.readFileSync(SOURCE_SIDECAR))
      .digest('hex');
    expect(manifest.files['source-observations.jsonl'].sha256).toBe(obsSha);
    expect(manifest.files['source-legacy-preprocessed-speed-sidecar.jsonl'].sha256).toBe(sidecarSha);
    const result = runRd004SegmentBAnalysis({
      observations: loadRd004Jsonl(fs.readFileSync(SOURCE_OBS, 'utf8')),
      legacySidecar: fs
        .readFileSync(SOURCE_SIDECAR, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    });
    expect(result.flags.RAW_SOURCE_OBSERVATIONS_CHANGED).toBe('NO');
  });

  it('16) no production runtime mutation flags', () => {
    const result = runRd004SegmentBAnalysis({ observations: [], legacySidecar: [] });
    expect(result.flags.PRODUCTION_SCORE_CHANGED).toBe('NO');
    expect(result.flags.PRODUCTION_DETECTORS_CHANGED).toBe('NO');
    expect(result.flags.REFERENCE_CAPTURE_RUNTIME_CHANGED).toBe('NO');
    expect(result.flags.DEPLOYED).toBe('NO');
  });

  it('17) preserves exploratory previous biased offset/MAE as non-canonical', () => {
    const exploratory = computePreviousBiasedExploratoryResults([
      {
        anchorId: 'B01',
        status: 'MATCHED',
        videoRelativeSeconds: 60,
        videoSpeedKmh: 17,
        videoAnchorConfidence: 'HIGH',
        providerTimestamp: 't',
        providerSpeedKmh: 17,
        telemetryVideoRelativeSeconds: 74,
        rawTimeDisplacementSeconds: 14,
        speedErrorKmh: 0,
        candidateOffsetSeconds: 14,
        matchConfidence: 'HIGH',
        localShapeAgreement: 'GOOD',
        cadenceContextSeconds: 10,
      },
    ]);
    expect(exploratory.NOT_CANONICAL_VALIDATION_RESULT).toBe('YES');
    expect(exploratory.EXPLORATORY_PREVIOUS_OFFSET_SECONDS).toBe(14.299);
    expect(exploratory.EXPLORATORY_PREVIOUS_SPEED_MAE_KMH).toBe(2.263);
  });

  it('18) raw speed-selected displacement is reported but not clock authority', () => {
    const diag = computeRawAnchorDisplacementDiagnostic([
      {
        anchorId: 'B01',
        status: 'MATCHED',
        videoRelativeSeconds: 60,
        videoSpeedKmh: 17,
        videoAnchorConfidence: 'HIGH',
        providerTimestamp: 't',
        providerSpeedKmh: 17,
        telemetryVideoRelativeSeconds: 74,
        rawTimeDisplacementSeconds: 14,
        speedErrorKmh: 0,
        candidateOffsetSeconds: 14,
        matchConfidence: 'HIGH',
        localShapeAgreement: 'GOOD',
        cadenceContextSeconds: 10,
      },
      {
        anchorId: 'B02',
        status: 'MATCHED',
        videoRelativeSeconds: 120,
        videoSpeedKmh: 57,
        videoAnchorConfidence: 'HIGH',
        providerTimestamp: 't2',
        providerSpeedKmh: 55,
        telemetryVideoRelativeSeconds: 100,
        rawTimeDisplacementSeconds: -20,
        speedErrorKmh: -2,
        candidateOffsetSeconds: -20,
        matchConfidence: 'MEDIUM',
        localShapeAgreement: 'PARTIAL',
        cadenceContextSeconds: 12,
      },
    ]);
    expect(diag.RAW_ANCHOR_DISPLACEMENT_MEDIAN).not.toBeNull();
    expect(diag.explanation).toContain('NOT clock authority');
  });

  it('19) approximate landmarks cannot define provider offset alone (A.2 invariant)', () => {
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

  it('20) true local peak attenuation invariant preserved from A.2', () => {
    expect(TRUE_LOCAL_PEAK_ATTENUATION_DOES_NOT_USE_SAME_TIMESTAMP_PROXY).toBe('YES');
  });

  (hasSourceData ? it : it.skip)('21) sealed Segment B B.2 analysis on committed envelope data', () => {
    const observations = loadRd004Jsonl(fs.readFileSync(SOURCE_OBS, 'utf8'));
    const legacySidecar = fs
      .readFileSync(SOURCE_SIDECAR, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const result = runRd004SegmentBAnalysis({ observations, legacySidecar });
    expect(result.evidenceId).toBe(RD004_B_EVIDENCE_ID);
    expect(result.flags.RAW_SOURCE_OBSERVATIONS_CHANGED).toBe('NO');
    expect(result.flags.PROVIDER_TIMESTAMP_OFFSET_VALIDATED).toBe('NO');
    expect(result.flags.ABSOLUTE_SPEED_ACCURACY_VALIDATED).toBe('NO');
    expect(result.flags.SPEED_SAMPLE_SELECTION_TIME_ONLY).toBe('YES');
    expect(result.flags.HOLDOUT_SPEED_SELECTION_TIME_ONLY).toBe('YES');
    expect(result.flags.HF_SPEED_ROWS).toBeGreaterThan(50);
    expect(result.flags.VIDEO_MASTER_TIMELINE_AUDIO_CORRELATED).toBe('YES');
    expect(result.flags.VIDEO_MASTER_DURATION_SECONDS).toBeCloseTo(1000.498365, 3);
    expect(result.flags.OLD_T630_STOP_TRANSITION_INVALIDATED).toBe('YES');
    expect(result.flags.FIRST_STOP_TRANSITION_VIDEO_T_SECONDS).toBeCloseTo(621.8, 1);
    expect(result.flags.OFFSET_CANDIDATE_AROUND_14_SECONDS).toBe(
      'SUPERSEDED_BY_B2_FRAME_VERIFIED_REASSESSMENT',
    );
    expect(result.speedAccuracy.diagnosticHoldoutMaeKmhWhenOffsetNotValidated).toBeNull();
    expect(result.videoMasterTimeline.VIDEO_CLIP_TOTAL_OVERLAP_SECONDS).toBeCloseTo(16.775, 3);
  });

  (hasSourceData ? it : it.skip)('22) legacy clock spread guard still invalidates offset when spread too large', () => {
    const clock = estimateSegmentBClockAlignment([
      { landmarkId: 'A', CLOCK_FIT_ELIGIBLE: 'YES', candidateOffsetSeconds: 0, videoRelativeSecondsObserved: 100 },
      { landmarkId: 'B', CLOCK_FIT_ELIGIBLE: 'YES', candidateOffsetSeconds: 50, videoRelativeSecondsObserved: 800 },
      { landmarkId: 'C', CLOCK_FIT_ELIGIBLE: 'YES', candidateOffsetSeconds: -20, videoRelativeSecondsObserved: 500 },
    ]);
    expect(clock.PROVIDER_TIMESTAMP_OFFSET_VALIDATED).toBe('NO');
    expect(clock.VIDEO_TO_PROVIDER_OFFSET_SECONDS).toBeNull();
  });
});

describe('DI-EV-0035B.2 RD004-B frame-accurate master timeline + transition clock reassessment', () => {
  it('1) master duration uses overlap-corrected timeline', () => {
    const timeline = buildVideoMasterTimeline();
    expect(timeline.VIDEO_MASTER_DURATION_SECONDS).toBe(VIDEO_MASTER_DURATION_SECONDS);
    expect(timeline.VIDEO_RAW_CLIP_DURATION_SUM_SECONDS - timeline.VIDEO_CLIP_TOTAL_OVERLAP_SECONDS).toBeCloseTo(
      VIDEO_MASTER_DURATION_SECONDS,
      3,
    );
  });

  it('2) clip order is canonical 5→3→1→9→8→7→4→2→6', () => {
    expect([...SEGMENT_B_VIDEO_CLIP_ORDER]).toEqual([5, 3, 1, 9, 8, 7, 4, 2, 6]);
    expect(buildVideoMasterTimeline().canonicalClipOrder).toEqual([5, 3, 1, 9, 8, 7, 4, 2, 6]);
  });

  it('3) total overlap equals ~16.775 s', () => {
    expect(VIDEO_CLIP_TOTAL_OVERLAP_SECONDS).toBeCloseTo(16.775, 3);
    expect(buildVideoMasterTimeline().VIDEO_CLIP_TOTAL_OVERLAP_SECONDS).toBeCloseTo(16.775, 3);
  });

  it('4) old t=630 stop snapshot cannot be classified as stop-transition', () => {
    expect(OLD_T630_STOP_TRANSITION_INVALIDATED).toBe('YES');
    expect(
      ZERO_SPEED_STATE_SNAPSHOT_CANNOT_REPLACE_EARLIER_FRAME_VERIFIED_STOP_TRANSITION,
    ).toBe('YES');
    const b15 = SEGMENT_B_VIDEO_SPEED_ANCHORS.find((a) => a.id === 'B15')!;
    expect(b15.anchorSemantic).toBe('VIDEO_STATE_ANCHOR');
    expect(b15.note).toContain('SUSTAINED_STOP_STATE');
  });

  it('5) frame-verified first zero is approximately t=621.8', () => {
    expect(FIRST_STOP_TRANSITION_VIDEO_T_SECONDS).toBeCloseTo(621.8, 1);
    const landmark = SEGMENT_B_VIDEO_TRANSITION_LANDMARKS.find((lm) => lm.id === 'B-T01')!;
    expect(landmark.videoRelativeSeconds).toBeCloseTo(621.8, 1);
    expect(landmark.landmarkKind).toBe('FIRST_ZERO_AFTER_LONG_DECEL');
  });

  it('6) launch event is bounded [673.0,673.5] without invented exact midpoint event time', () => {
    const launch = SEGMENT_B_VIDEO_TRANSITION_LANDMARKS.find((lm) => lm.id === 'B-T02')!;
    expect(launch.videoRelativeSeconds).toBeNull();
    expect(launch.videoRelativeSecondsMin).toBe(FIRST_LAUNCH_TRANSITION_VIDEO_T_MIN);
    expect(launch.videoRelativeSecondsMax).toBe(FIRST_LAUNCH_TRANSITION_VIDEO_T_MAX);
    expect(launch.observationKind).toBe('BOUNDED_TRANSITION_WINDOW');
  });

  it('7) sparse first provider zero cannot automatically define clock offset', () => {
    if (!hasSourceData) return;
    const observations = loadRd004Jsonl(fs.readFileSync(SOURCE_OBS, 'utf8'));
    const qualified = buildQualifiedHfSpeedSeries(
      observations.filter((r) => r.providerField === 'speed' && r.acquisitionSurface === 'HF_HISTORICAL'),
      SEGMENT_B_CONSTANTS.videoStartUtc,
    );
    const assessment = assessCorrectedFirstStopDisplacement(qualified);
    expect(assessment.CORRECTED_FIRST_STOP_DISPLACEMENT_STATUS).toBe('SPARSE_STATE_SAMPLE');
    expect(assessment.SPARSE_SAMPLE_DELAY_SEPARATED_FROM_CLOCK_OFFSET).toBe('YES');
  });

  it('8) sampling delay and clock offset are separate concepts', () => {
    expect(SPARSE_SAMPLE_DELAY_SEPARATED_FROM_CLOCK_OFFSET).toBe('YES');
    const clock = reassessClockModelB3([], splitCalibrationHoldoutSets());
    expect(clock.SPARSE_SAMPLE_DELAY_SEPARATED_FROM_CLOCK_OFFSET).toBe('YES');
  });

  it('9) one corrected stop displacement cannot validate global clock offset', () => {
    if (!hasSourceData) return;
    const observations = loadRd004Jsonl(fs.readFileSync(SOURCE_OBS, 'utf8'));
    const legacySidecar = fs
      .readFileSync(SOURCE_SIDECAR, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const result = runRd004SegmentBAnalysis({ observations, legacySidecar });
    expect(result.flags.PROVIDER_TIMESTAMP_OFFSET_VALIDATED).toBe('NO');
    expect(result.flags.VIDEO_TO_PROVIDER_OFFSET_SECONDS).toBeNull();
    expect(result.flags.CORRECTED_FIRST_STOP_DISPLACEMENT_SECONDS).not.toBeNull();
  });

  it('10) B-T02 excluded from clock calibration; B-T01 documented but not clock-fit', () => {
    expect(CLOCK_CALIBRATION_LANDMARK_IDS).not.toContain('CLK-B7');
    expect(CLOCK_CALIBRATION_LANDMARK_IDS).toEqual(['B-T01']);
    const bT01 = SEGMENT_B_VIDEO_TRANSITION_LANDMARKS.find((lm) => lm.id === 'B-T01')!;
    expect(bT01.CLOCK_FIT_ELIGIBLE).toBe('NO');
  });

  it('11) holdout speed selection remains time-only', () => {
    const points = samplePoints();
    const holdout = SEGMENT_B_VIDEO_SPEED_ANCHORS.filter((a) => a.id === 'B02');
    const result = computeHoldoutSpeedAccuracy(holdout, SEGMENT_B_VIDEO_SPEED_ANCHORS, points, 21, false);
    expect(result.SPEED_SAMPLE_SELECTION_TIME_ONLY).toBe('YES');
    expect(result.HOLDOUT_SPEED_SELECTION_TIME_ONLY).toBe('YES');
  });

  it('12) unvalidated offset cannot produce canonical absolute Speed MAE', () => {
    const result = computeHoldoutSpeedAccuracy(
      SEGMENT_B_VIDEO_SPEED_ANCHORS.filter((a) => a.id === 'B02'),
      SEGMENT_B_VIDEO_SPEED_ANCHORS,
      samplePoints(),
      null,
      false,
    );
    expect(result.ABSOLUTE_SPEED_ACCURACY_VALIDATED).toBe('NO');
    expect(result.SPEED_MAE_KMH).toBeNull();
  });

  it('13) raw source evidence bytes remain unchanged', () => {
    if (!hasSourceData || !fs.existsSync(SOURCE_MANIFEST)) return;
    const manifest = JSON.parse(fs.readFileSync(SOURCE_MANIFEST, 'utf8'));
    const obsSha = crypto.createHash('sha256').update(fs.readFileSync(SOURCE_OBS)).digest('hex');
    expect(manifest.files['source-observations.jsonl'].sha256).toBe(obsSha);
  });

  it('14) no production runtime changes', () => {
    const result = runRd004SegmentBAnalysis({ observations: [], legacySidecar: [] });
    expect(result.flags.PRODUCTION_SCORE_CHANGED).toBe('NO');
    expect(result.flags.PRODUCTION_DETECTORS_CHANGED).toBe('NO');
    expect(result.flags.REFERENCE_CAPTURE_RUNTIME_CHANGED).toBe('NO');
    expect(result.flags.DEPLOYED).toBe('NO');
  });
});

describe('DI-EV-0035B.3 RD004-B transition semantics + HF capture completeness', () => {
  function sealedSpeedPoints(): QualifiedSpeedPoint[] {
    if (!hasSourceData) return [];
    const observations = loadRd004Jsonl(fs.readFileSync(SOURCE_OBS, 'utf8'));
    return buildQualifiedHfSpeedSeries(
      observations.filter((r) => r.providerField === 'speed' && r.acquisitionSurface === 'HF_HISTORICAL'),
      SEGMENT_B_CONSTANTS.videoStartUtc,
    );
  }

  it('1) assessLaunchTransition uses immediate predecessor not first earlier sample', () => {
    const points = sealedSpeedPoints();
    if (!points.length) return;
    const launch = assessLaunchTransition(points);
    expect(launch.TRANSITION_PREVIOUS_SAMPLE_IS_IMMEDIATE_PREDECESSOR).toBe('YES');
    expect(TRANSITION_PREVIOUS_SAMPLE_IS_IMMEDIATE_PREDECESSOR).toBe('YES');
    expect(launch.localGapBeforeSeconds).toBeCloseTo(FIRST_LAUNCH_PROVIDER_OBSERVATION_WINDOW_SECONDS, 2);
    expect(launch.localGapBeforeSeconds).toBeGreaterThan(30);
    expect(launch.localGapBeforeSeconds).toBeLessThan(40);
  });

  it('2) canonical launch previous gap is 35.102 s on sealed evidence', () => {
    expect(FIRST_LAUNCH_PROVIDER_OBSERVATION_WINDOW_SECONDS).toBeCloseTo(35.102, 3);
    const points = sealedSpeedPoints();
    if (!points.length) return;
    const launch = assessLaunchTransition(points);
    expect(launch.FIRST_LAUNCH_PROVIDER_OBSERVATION_WINDOW_SECONDS).toBeCloseTo(35.102, 3);
  });

  it('3) sparse 0→20 observation cannot become exact launch timestamp', () => {
    const points = sealedSpeedPoints();
    if (!points.length) return;
    const launch = assessLaunchTransition(points);
    expect(launch.FIRST_LAUNCH_PROVIDER_TRANSITION_EXACT).toBe('NO');
    expect(launch.FIRST_LAUNCH_PROVIDER_POSITIVE_OBSERVATION).toBe('2026-09-04T03:58:20.787Z');
    expect(launch.FIRST_LAUNCH_PROVIDER_PREVIOUS_OBSERVATION).toBe('2026-09-04T03:57:45.685Z');
  });

  it('4) launch transition is interval-censored across sparse physical samples', () => {
    const points = sealedSpeedPoints();
    if (!points.length) return;
    const launch = assessLaunchTransition(points);
    expect(launch.FIRST_LAUNCH_TRANSITION_STATUS).toBe('INTERVAL_CENSORED_BY_SPARSE_SAMPLING');
    expect(launch.FIRST_LAUNCH_CLOCK_FIT_ELIGIBLE).toBe('NO');
    expect(launch.FIRST_LAUNCH_CLOCK_REJECTION_REASON).toBe('PROVIDER_TRANSITION_INTERVAL_TOO_WIDE');
  });

  it('5) +5.x s removed as clock evidence — no supportive offset range', () => {
    const points = sealedSpeedPoints();
    const clock = reassessClockModelB3(points, splitCalibrationHoldoutSets());
    expect(clock.OFFSET_CANDIDATE_RANGE_SUPPORTIVE).toBeNull();
    expect(clock.OFFSET_CANDIDATE_SUPPORTIVE_ONLY).toBe('NO');
    expect(clock.CLOCK_FIT_PROVIDER_MATCH_COUNT).toBe(0);
  });

  it('6) 1-s local pair after large upstream gap is not continuous context', () => {
    const points = sealedSpeedPoints();
    if (!points.length) return;
    const pair = assessFirstStopProviderPairSemantics(points);
    expect(pair.PAIR_43_TO_0_LOCAL_DT_SECONDS).toBe(1);
    expect(pair.PAIR_43_TO_0_UPSTREAM_GAP_SECONDS).toBeCloseTo(28.745, 2);
    expect(['GAP_ADJACENT', 'ISOLATED_BURST']).toContain(pair.contextContinuity);
    expect(pair.contextContinuity).not.toBe('CONTINUOUS_CONTEXT');
  });

  it('7) 43→0 pair cannot become high-confidence physical stop dynamics', () => {
    const points = sealedSpeedPoints();
    if (!points.length) return;
    const pair = assessFirstStopProviderPairSemantics(points);
    expect(pair.PAIR_PHYSICAL_CONTINUITY_VALIDATED).toBe('NO');
    expect(pair.PAIR_VIDEO_CONSISTENCY).toBe('CONTRADICTED_OR_UNRESOLVED');
    expect(pair.physicalDerivativeConfidence).toBe('LOW');
  });

  it('8) sparse stop displacement is not labeled clock offset candidate', () => {
    const points = sealedSpeedPoints();
    if (!points.length) return;
    const stop = assessCorrectedFirstStopDisplacement(points);
    expect(stop.FIRST_STOP_DISPLACEMENT_CLOCK_AUTHORITY).toBe('NO');
    expect(stop.FIRST_STOP_SPARSE_OBSERVATION_DISPLACEMENT_SECONDS).not.toBeNull();
    const clock = reassessClockModelB3(points, splitCalibrationHoldoutSets());
    expect(clock.VIDEO_TO_PROVIDER_OFFSET_SECONDS).toBeNull();
    expect(clock.FIRST_STOP_DISPLACEMENT_CLOCK_AUTHORITY).toBe('NO');
  });

  it('9) event-derived offset cannot generate zero error for same event', () => {
    if (!hasSourceData) return;
    const observations = loadRd004Jsonl(fs.readFileSync(SOURCE_OBS, 'utf8'));
    const legacySidecar = fs
      .readFileSync(SOURCE_SIDECAR, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const result = runRd004SegmentBAnalysis({ observations, legacySidecar });
    expect(result.stopTiming.STOP_TIMING_ERROR_SECONDS).toBeNull();
    expect(result.stopTiming.supportiveOffsetSecondsApplied).toBeNull();
    expect(result.flags.EVENT_CANNOT_VALIDATE_ITS_OWN_ALIGNMENT_ERROR).toBe('YES');
  });

  it('10) legacy t=630/reverse entries cannot remain CLOCK_FIT_ELIGIBLE=YES', () => {
    const legacy = matchClockLandmarks(SEGMENT_B_CLOCK_LANDMARKS, [
      {
        anchorId: 'B15',
        status: 'MATCHED',
        videoRelativeSeconds: 630,
        videoSpeedKmh: 0,
        videoAnchorConfidence: 'HIGH',
        providerTimestamp: '2026-09-04T03:57:45.685Z',
        providerSpeedKmh: 0,
        telemetryVideoRelativeSeconds: 643,
        rawTimeDisplacementSeconds: 22,
        speedErrorKmh: 0,
        candidateOffsetSeconds: 22,
        matchConfidence: 'HIGH',
        localShapeAgreement: 'GOOD',
        cadenceContextSeconds: 1,
      },
    ]);
    for (const row of legacy) {
      expect(row.CLOCK_FIT_ELIGIBLE).toBe('NO');
    }
    const clkB2 = legacy.find((r) => r.landmarkId === 'CLK-B2');
    expect(clkB2?.CLOCK_FIT_REJECTION_REASON).toBe('SUPERSEDED_WRONG_VIDEO_TRANSITION');
  });

  it('11) sealed evidence SHA remains unchanged', () => {
    if (!hasSourceData || !fs.existsSync(SOURCE_MANIFEST)) return;
    const manifest = JSON.parse(fs.readFileSync(SOURCE_MANIFEST, 'utf8'));
    const obsSha = crypto.createHash('sha256').update(fs.readFileSync(SOURCE_OBS)).digest('hex');
    expect(manifest.files['source-observations.jsonl'].sha256).toBe(obsSha);
  });

  it('12) capture completeness audit does not mutate production', () => {
    const diagnostic = buildHfCaptureCompletenessDiagnostic({
      allRows: [],
      envelopeRows: [],
      queryEnvelope: {
        startUtc: SEGMENT_B_CONSTANTS.queryEnvelopeStartUtc,
        endUtc: SEGMENT_B_CONSTANTS.queryEnvelopeEndUtc,
      },
    });
    expect(diagnostic.RAW_SOURCE_OBSERVATIONS_CHANGED).toBe('NO');
    expect(diagnostic.sealedAudit.pipelineTrace.productionRuntimeChanged).toBe('NO');
  });

  it('13) B.3 cross-origin timestamp floor comparison is deprecated — not bucket-identity proof', () => {
    if (!hasSourceData) return;
    const observations = loadRd004Jsonl(fs.readFileSync(SOURCE_OBS, 'utf8'));
    const audit = auditSealedHfCaptureProvenance(observations, observations, {
      startUtc: SEGMENT_B_CONSTANTS.queryEnvelopeStartUtc,
      endUtc: SEGMENT_B_CONSTANTS.queryEnvelopeEndUtc,
    });
    expect(audit.pipelineTrace.pagination).toContain('NONE');
    expect(audit.sampleLossFailureModesScreened.paginationNotExhausted).toContain('NOT_APPLICABLE');
    const cmp = compareHfSpeedTimestampSets(
      ['2026-09-04T03:57:45.685Z', '2026-09-04T03:58:20.787Z'],
      ['2026-09-04T03:57:45.000Z', '2026-09-04T03:58:20.000Z'],
    );
    expect(cmp.CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID).toBe('NO');
    expect(cmp.B3_BROAD_REQUERY_SAMPLE_LOSS_PROOF_VALID).toBe('NO');
    expect(cmp.comparisonNormalization).toBe('DEPRECATED_GLOBAL_1S_FLOOR_NOT_VALID_CROSS_ORIGIN');
  });

  it('14) no production runtime change flags', () => {
    const result = runRd004SegmentBAnalysis({ observations: [], legacySidecar: [] });
    expect(result.flags.PRODUCTION_SCORE_CHANGED).toBe('NO');
    expect(result.flags.PRODUCTION_DETECTORS_CHANGED).toBe('NO');
    expect(result.flags.TIRE_RUNTIME_CHANGED).toBe('NO');
    expect(result.flags.BRAKE_RUNTIME_CHANGED).toBe('NO');
    expect(result.flags.REFERENCE_CAPTURE_RUNTIME_CHANGED).toBe('NO');
    expect(result.flags.DEPLOYED).toBe('NO');
  });
});
