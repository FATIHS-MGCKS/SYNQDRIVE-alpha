import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  assertNoEnvironmentSpecificPathsInObject,
  buildQualifiedHfSpeedSeries,
  comparePreprocessingResponse,
  computeAccelerationGapSensitivity,
  computeQualifiedAccelerationPairs,
  computeRd004SourceBundleSha256,
  computeTrueLocalPeakEvents,
  detectOutOfOrderByAcquisitionOrder,
  estimateClockAlignment,
  estimateDrift,
  extractProvisionalLandmarkHDisplacement,
  filterRowsByProviderTimestampEnvelope,
  findSpeedEpisodes,
  loadRd004Jsonl,
  matchVideoLandmarks,
  PROVISIONAL_ACCELERATION_MAX_GAP_SECONDS,
  RD004_A_EVIDENCE_ID,
  RD004_A_SOURCE_FILES,
  runRd004SegmentAAnalysis,
  SEGMENT_A_CONSTANTS,
  sortedPercentile,
  toRepoRelativePath,
  VIDEO_LANDMARKS,
  APPROXIMATE_NON_UNIQUE_LANDMARK_CANNOT_DEFINE_PROVIDER_CLOCK_OFFSET,
  TRUE_LOCAL_PEAK_ATTENUATION_DOES_NOT_USE_SAME_TIMESTAMP_PROXY,
  type QualifiedSpeedPoint,
  type SpeedEpisode,
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

function makeEpisode(overrides: Partial<SpeedEpisode> & Pick<SpeedEpisode, 'type' | 'startTimestamp'>): SpeedEpisode {
  const base: SpeedEpisode = {
    episodeId: `${overrides.type}:${overrides.startTimestamp}`,
    type: overrides.type,
    startTimestamp: overrides.startTimestamp,
    endTimestamp: overrides.endTimestamp ?? overrides.startTimestamp,
    startSpeedKmh: overrides.startSpeedKmh ?? 0,
    endSpeedKmh: overrides.endSpeedKmh ?? 0,
    durationSeconds: overrides.durationSeconds ?? 0,
    meanSpeedKmh: overrides.meanSpeedKmh ?? 0,
    videoRelativeStart: overrides.videoRelativeStart ?? 0,
    videoRelativeEnd: overrides.videoRelativeEnd ?? 0,
  };
  return { ...base, ...overrides, episodeId: `${overrides.type}:${overrides.startTimestamp}` };
}

describe('DI-EV-0035A.1 RD004-A methodology correctness', () => {
  it('1) landmarks without independent video time produce null clock offset', () => {
    const episodes = [
      makeEpisode({
        type: 'deceleration',
        startTimestamp: '2026-09-04T03:40:00.000Z',
        startSpeedKmh: 40,
        endSpeedKmh: 5,
        durationSeconds: 20,
        videoRelativeStart: 100,
      }),
    ];
    const matches = matchVideoLandmarks(
      VIDEO_LANDMARKS.filter((lm) => lm.id === 'B'),
      episodes,
    );
    expect(matches[0]!.candidateOffsetSeconds).toBeNull();
    expect(matches[0]!.CLOCK_FIT_ELIGIBLE).toBe('NO');
  });

  it('2) circular expectedVideoT=telemetryT offset behavior is impossible', () => {
    const episodes = [
      makeEpisode({
        type: 'launch',
        startTimestamp: '2026-09-04T03:42:00.000Z',
        startSpeedKmh: 0,
        endSpeedKmh: 50,
        durationSeconds: 30,
        videoRelativeStart: 200,
      }),
    ];
    const matches = matchVideoLandmarks(
      VIDEO_LANDMARKS.filter((lm) => lm.id === 'D'),
      episodes,
    );
    expect(matches[0]!.candidateOffsetSeconds).toBeNull();
    expect(matches[0]!.videoRelativeSecondsObserved).toBeNull();
  });

  it('3) same telemetry episode cannot count twice as independent clock evidence', () => {
    const shared = makeEpisode({
      type: 'launch',
      startTimestamp: '2026-09-04T03:42:27.018Z',
      startSpeedKmh: 0,
      endSpeedKmh: 44,
      durationSeconds: 30,
      videoRelativeStart: 281,
    });
    const matches = matchVideoLandmarks(
      VIDEO_LANDMARKS.filter((lm) => lm.id === 'D' || lm.id === 'G'),
      [shared],
    );
    const clockEligible = matches.filter((m) => m.CLOCK_FIT_ELIGIBLE === 'YES');
    expect(clockEligible.length).toBeLessThanOrEqual(1);
  });

  it('4) weak/failed H landmark is excluded from drift fitting', () => {
    const landmarkMatches = [
      {
        landmarkId: 'H',
        CLOCK_FIT_ELIGIBLE: 'NO',
        videoRelativeSecondsObserved: 340,
        candidateOffsetSeconds: -341,
        telemetryMatchConfidence: 'INSUFFICIENT',
        status: 'NOT_FOUND_IN_TELEMETRY',
      },
      {
        landmarkId: 'A',
        CLOCK_FIT_ELIGIBLE: 'NO',
        videoRelativeSecondsObserved: 8,
        candidateOffsetSeconds: null,
        telemetryMatchConfidence: 'INSUFFICIENT',
      },
    ];
    const drift = estimateDrift(landmarkMatches, SEGMENT_A_CONSTANTS.videoDurationSeconds);
    expect(drift.DRIFT_VALIDATED).toBe('NO');
    expect(drift.ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT).toBeNull();
    expect(drift.DRIFT_FIT_REJECTED_LANDMARKS.length).toBeGreaterThan(0);
  });

  it('5) drift remains null when reliable independent landmarks are insufficient', () => {
    const landmarkMatches = [
      {
        landmarkId: 'H',
        CLOCK_FIT_ELIGIBLE: 'YES',
        videoRelativeSecondsObserved: 340,
        candidateOffsetSeconds: 8,
        telemetryMatchConfidence: 'MEDIUM',
      },
    ];
    const drift = estimateDrift(landmarkMatches, SEGMENT_A_CONSTANTS.videoDurationSeconds);
    expect(drift.DRIFT_VALIDATED).toBe('NO');
    expect(drift.ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT).toBeNull();
  });

  it('6) temporal locality prevents H from matching beginning-of-drive episode', () => {
    const episodes = [
      makeEpisode({
        type: 'low_speed',
        startTimestamp: '2026-09-04T03:37:44.122Z',
        startSpeedKmh: 0,
        videoRelativeStart: -1.878,
      }),
      makeEpisode({
        type: 'low_speed',
        startTimestamp: '2026-09-04T03:43:48.205Z',
        startSpeedKmh: 15,
        videoRelativeStart: 362,
      }),
    ];
    const matches = matchVideoLandmarks(
      VIDEO_LANDMARKS.filter((lm) => lm.id === 'H'),
      episodes,
    );
    expect(matches[0]!.status).toBe('MATCHED');
    expect(matches[0]!.telemetryVideoRelativeProvisional).toBeGreaterThan(300);
    expect(matches[0]!.telemetryVideoRelativeProvisional).not.toBe(-1.878);
  });

  it('7) sortedPercentile sorts numeric input correctly', () => {
    expect(sortedPercentile([10, 1, 9, 2, 8], 50)).toBe(8);
    expect(sortedPercentile([5, 1, 3], 50)).toBe(3);
  });

  it('8) acceleration median is correct for unsorted qualified pairs', () => {
    const points: QualifiedSpeedPoint[] = [
      { acquisitionOrdinal: 1, providerTimestamp: '2026-09-04T03:37:46.000Z', speedKmh: 0, videoRelativeSecondsProvisional: 0, flags: [] },
      { acquisitionOrdinal: 2, providerTimestamp: '2026-09-04T03:37:47.000Z', speedKmh: 5, videoRelativeSecondsProvisional: 1, flags: [] },
      { acquisitionOrdinal: 3, providerTimestamp: '2026-09-04T03:37:48.000Z', speedKmh: 15, videoRelativeSecondsProvisional: 2, flags: [] },
      { acquisitionOrdinal: 4, providerTimestamp: '2026-09-04T03:37:49.000Z', speedKmh: 20, videoRelativeSecondsProvisional: 3, flags: [] },
      { acquisitionOrdinal: 5, providerTimestamp: '2026-09-04T03:37:50.000Z', speedKmh: 22, videoRelativeSecondsProvisional: 4, flags: [] },
    ];
    const accel = computeQualifiedAccelerationPairs(points, 2);
    const values = accel.qualifiedPairs.map((p) => p.accelMs2);
    expect(accel.distribution.medianMs2).toBe(sortedPercentile(values, 50));
    expect(accel.distribution.medianMs2).not.toBe(accel.distribution.maxPositiveMs2);
  });

  it('9) preprocessing timing cannot match distant events by speed value alone', () => {
    const points: QualifiedSpeedPoint[] = [
      { acquisitionOrdinal: 1, providerTimestamp: '2026-09-04T03:37:46.000Z', speedKmh: 0, videoRelativeSecondsProvisional: 0, flags: [] },
      { acquisitionOrdinal: 2, providerTimestamp: '2026-09-04T03:38:00.000Z', speedKmh: 50, videoRelativeSecondsProvisional: 14, flags: [] },
      { acquisitionOrdinal: 3, providerTimestamp: '2026-09-04T03:38:02.000Z', speedKmh: 30, videoRelativeSecondsProvisional: 16, flags: [] },
      { acquisitionOrdinal: 4, providerTimestamp: '2026-09-04T03:43:00.000Z', speedKmh: 50, videoRelativeSecondsProvisional: 314, flags: [] },
      { acquisitionOrdinal: 5, providerTimestamp: '2026-09-04T03:43:02.000Z', speedKmh: 30, videoRelativeSecondsProvisional: 316, flags: [] },
    ];
    const sidecar = points.map((p) => ({
      providerTimestamp: p.providerTimestamp,
      qualifiedRawHfSpeedKmh: p.speedKmh,
      legacy3PointSmoothedSpeedKmh: p.speedKmh * 0.8,
    }));
    const result = comparePreprocessingResponse(points, sidecar);
    expect(result.PREPROCESSING_LOCAL_EVENT_METHOD).toBe('SAME_WINDOW_INDEPENDENT_RAW_AND_SMOOTHED_PEAKS');
    const shifts = result.localEventTimings
      .map((t) => t.onsetShiftSeconds)
      .filter((v): v is number => v != null);
    for (const shift of shifts) {
      expect(Math.abs(shift)).toBeLessThan(25);
    }
  });

  it('10) preprocessing timing becomes NOT_VALIDATED when no local event match exists', () => {
    const points: QualifiedSpeedPoint[] = [
      { acquisitionOrdinal: 1, providerTimestamp: '2026-09-04T03:37:46.000Z', speedKmh: 10, videoRelativeSecondsProvisional: 0, flags: [] },
      { acquisitionOrdinal: 2, providerTimestamp: '2026-09-04T03:37:50.000Z', speedKmh: 10, videoRelativeSecondsProvisional: 4, flags: [] },
    ];
    const sidecar = points.map((p) => ({
      providerTimestamp: p.providerTimestamp,
      qualifiedRawHfSpeedKmh: p.speedKmh,
      legacy3PointSmoothedSpeedKmh: p.speedKmh,
    }));
    const result = comparePreprocessingResponse(points, sidecar);
    expect(result.PREPROCESSING_TIMING_VALIDATED).toBe('NO');
    expect(result.PREPROCESSING_START_SHIFT_SECONDS_MEDIAN).toBeNull();
  });

  it('11) gear with zero observations returns NOT_OBSERVED usefulness', () => {
    const result = runRd004SegmentAAnalysis({ observations: [], legacySidecar: [] });
    expect(result.flags.GEAR_STATE_OBSERVED).toBe('NO');
    expect(result.flags.GEAR_STATE_USEFUL_FOR_SEGMENT_A).toBe('NOT_OBSERVED');
  });

  it('12) supporting-signal usefulness is not derived from sample count alone', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      makeTelemetryRow({
        providerField: 'powertrainCombustionEngineSpeed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: `2026-09-04T03:38:${String(40 + i).padStart(2, '0')}.000Z`,
        physicalSampleFingerprint: `rpm-${i}`,
        rawValueJson: 700,
        acquisitionOrdinal: i + 1,
      }),
    );
    const result = runRd004SegmentAAnalysis({ observations: rows, legacySidecar: [] });
    expect(result.supportingSignals.RPM_SEGMENT_A_VALIDATION).toBe('NOT_DYNAMICALLY_INFORMATIVE');
  });

  it('13) canonical artifacts contain repo-relative paths only', () => {
    const rel = toRepoRelativePath('/workspace/docs/audits/data/rd004-segment-a/source-observations.jsonl');
    expect(rel).toBe('docs/audits/data/rd004-segment-a/source-observations.jsonl');
    expect(containsNoEnvPaths(rel)).toBe(true);
    const violations = assertNoEnvironmentSpecificPathsInObject({
      sourceObservationsPath: rel,
      sourceLegacySidecarPath: 'docs/audits/data/rd004-segment-a/source-legacy-preprocessed-speed-sidecar.jsonl',
    });
    expect(violations).toHaveLength(0);
  });

  it('14) bundle SHA differs from individual file SHA when bundle has multiple members', () => {
    const obsSha = '5938b9e9120864768dd91048fb06a182ef2b7f0772a9a2df2c75f17cb684d2e2';
    const sidecarSha = 'a7b9410d11a7adbb6df52a532e8f74a3baf9b52f854326f89f832bd36d236d3e';
    const { bundleSha256 } = computeRd004SourceBundleSha256({
      [RD004_A_SOURCE_FILES.observations]: obsSha,
      [RD004_A_SOURCE_FILES.legacySidecar]: sidecarSha,
    });
    expect(bundleSha256).not.toBe(obsSha);
    expect(bundleSha256).not.toBe(sidecarSha);
  });

  it('15) manifest filenames match committed evidence filenames', () => {
    expect(RD004_A_SOURCE_FILES.observations).toBe('source-observations.jsonl');
    expect(RD004_A_SOURCE_FILES.legacySidecar).toBe('source-legacy-preprocessed-speed-sidecar.jsonl');
    expect(RD004_A_SOURCE_FILES.manifest).toBe('source-manifest.sha256.json');
  });

  it('16) out-of-order detection respects acquisition order', () => {
    const rows = [
      makeTelemetryRow({
        acquisitionOrdinal: 1,
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-04T03:37:50.000Z',
        physicalSampleFingerprint: 'a',
        rawValueJson: 10,
      }),
      makeTelemetryRow({
        acquisitionOrdinal: 2,
        providerField: 'speed',
        acquisitionSurface: 'HF_HISTORICAL',
        providerTimestamp: '2026-09-04T03:37:46.000Z',
        physicalSampleFingerprint: 'b',
        rawValueJson: 12,
      }),
    ];
    expect(detectOutOfOrderByAcquisitionOrder(rows)).toBe(1);
  });

  it('17) no production runtime mutation flags', () => {
    const result = runRd004SegmentAAnalysis({ observations: [], legacySidecar: [] });
    expect(result.flags.PRODUCTION_SCORE_CHANGED).toBe('NO');
    expect(result.flags.PRODUCTION_DETECTORS_CHANGED).toBe('NO');
    expect(result.flags.DEPLOYED).toBe('NO');
  });

  it('18) RD004 whole drive remains incomplete', () => {
    const result = runRd004SegmentAAnalysis({ observations: [], legacySidecar: [] });
    expect(result.flags.RD004_WHOLE_DRIVE_COMPLETE).toBe('NO');
    expect(result.flags.SEGMENT_B_PENDING).toBe('YES');
  });

  it('19) landmark A reverse: 0 km/h is not clock-fit eligible for ~2 km/h reverse', () => {
    const episodes = [
      makeEpisode({
        type: 'low_speed',
        startTimestamp: '2026-09-04T03:37:48.647Z',
        startSpeedKmh: 0,
        videoRelativeStart: 2.647,
      }),
    ];
    const matches = matchVideoLandmarks(
      VIDEO_LANDMARKS.filter((lm) => lm.id === 'A'),
      episodes,
    );
    expect(matches[0]!.CLOCK_FIT_ELIGIBLE).toBe('NO');
    expect(matches[0]!.candidateOffsetSeconds).toBeNull();
    expect(matches[0]!.telemetryMatchConfidence).toBe('INSUFFICIENT');
  });

  it('20) approximate landmark H cannot populate VIDEO_TO_PROVIDER_OFFSET_SECONDS', () => {
    const landmarkMatches = [
      {
        landmarkId: 'H',
        CLOCK_FIT_ELIGIBLE: 'NO',
        candidateOffsetSeconds: null,
        exploratoryDisplacementSeconds: 22.205,
        exploratoryDisplacementClassification: 'NOT_A_CLOCK_OFFSET_ESTIMATE',
        videoTimingAuthority: 'APPROXIMATE',
      },
      {
        landmarkId: 'B',
        CLOCK_FIT_ELIGIBLE: 'YES',
        candidateOffsetSeconds: 8,
      },
    ];
    const clock = estimateClockAlignment(landmarkMatches);
    expect(clock.VIDEO_TO_PROVIDER_OFFSET_SECONDS).toBeNull();
    expect(clock.PROVIDER_TIMESTAMP_OFFSET_VALIDATED).toBe('NO');
    expect(clock.VIDEO_PROVIDER_ALIGNMENT_CLASS).toBe('INSUFFICIENT_EVIDENCE');
    expect(clock.CLOCK_FIT_ELIGIBLE_LANDMARKS).toEqual(['B']);
    expect(clock.PROVISIONAL_LANDMARK_H_DISPLACEMENT_SECONDS).toBe(22.205);
    expect(clock.PROVISIONAL_LANDMARK_H_DISPLACEMENT_VALIDATED).toBe('NO');
    expect(clock.APPROXIMATE_NON_UNIQUE_LANDMARK_CANNOT_DEFINE_PROVIDER_CLOCK_OFFSET).toBe('YES');
  });

  it('21) acceleration gap sensitivity reports multiple candidate thresholds', () => {
    const points: QualifiedSpeedPoint[] = [
      { acquisitionOrdinal: 1, providerTimestamp: '2026-09-04T03:37:46.000Z', speedKmh: 0, videoRelativeSecondsProvisional: 0, flags: [] },
      { acquisitionOrdinal: 2, providerTimestamp: '2026-09-04T03:37:47.000Z', speedKmh: 10, videoRelativeSecondsProvisional: 1, flags: [] },
      { acquisitionOrdinal: 3, providerTimestamp: '2026-09-04T03:37:50.000Z', speedKmh: 20, videoRelativeSecondsProvisional: 4, flags: [] },
    ];
    const sensitivity = computeAccelerationGapSensitivity(points);
    expect(sensitivity.length).toBe(3);
    expect(sensitivity.map((s) => s.gapSeconds)).toEqual([2, 3, 5]);
  });

  (hasSourceData ? it : it.skip)('22) sealed source observations SHA unchanged', () => {
    const content = fs.readFileSync(SOURCE_OBS, 'utf8');
    const sha = crypto.createHash('sha256').update(content).digest('hex');
    expect(sha).toBe(SEGMENT_A_CONSTANTS.sealedEvidenceSha256);
  });

  (hasSourceData ? it : it.skip)('23) full Segment-A analysis on sealed data with corrected methodology', () => {
    const observations = loadRd004Jsonl(fs.readFileSync(SOURCE_OBS, 'utf8'));
    const legacySidecar = fs
      .readFileSync(SOURCE_SIDECAR, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const result = runRd004SegmentAAnalysis({ observations, legacySidecar });
    expect(result.evidenceId).toBe(RD004_A_EVIDENCE_ID);
    expect(result.flags.HF_SPEED_ROWS).toBe(38);
    expect(result.flags.CIRCULAR_LANDMARK_ALIGNMENT_REMOVED).toBe('YES');
    expect(result.flags.DRIFT_VALIDATED).toBe('NO');
    expect(result.flags.ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT).toBeNull();
    expect(result.flags.ACCELERATION_PERCENTILE_BUG_FIXED).toBe('YES');
    expect(result.flags.GEAR_STATE_OBSERVED).toBe('NO');
    expect(result.flags.VIDEO_SEVERITY_CONFIRMATION).toBe('NOT_VALIDATED');
    expect(result.flags.VIDEO_TO_PROVIDER_OFFSET_SECONDS).toBeNull();
    expect(result.flags.PROVIDER_TIMESTAMP_OFFSET_VALIDATED).toBe('NO');
    expect(result.flags.CLOCK_FIT_ELIGIBLE_LANDMARKS).toEqual([]);
    expect(result.flags.VIDEO_PROVIDER_ALIGNMENT_CLASS).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.flags.PROVISIONAL_LANDMARK_H_DISPLACEMENT_VALIDATED).toBe('NO');
    expect(result.flags.APPROXIMATE_NON_UNIQUE_LANDMARK_CANNOT_DEFINE_PROVIDER_CLOCK_OFFSET).toBe('YES');
    expect(result.flags.TRUE_LOCAL_PEAK_ATTENUATION_DOES_NOT_USE_SAME_TIMESTAMP_PROXY).toBe('YES');
    expect(result.flags.CALM_BASELINE_FALSE_POSITIVE_CHECK).toBe(
      'NO_FALSE_POSITIVES_OBSERVED_ON_AVAILABLE_DATA',
    );
  });
});

describe('DI-EV-0035A.2 RD004-A semantics closeout', () => {
  it('24) approximate non-unique H cannot populate VIDEO_TO_PROVIDER_OFFSET_SECONDS', () => {
    const landmarkMatches = [
      {
        landmarkId: 'H',
        CLOCK_FIT_ELIGIBLE: 'NO',
        exploratoryDisplacementSeconds: 22.205,
        exploratoryDisplacementClassification: 'NOT_A_CLOCK_OFFSET_ESTIMATE',
      },
    ];
    const clock = estimateClockAlignment(landmarkMatches);
    expect(clock.VIDEO_TO_PROVIDER_OFFSET_SECONDS).toBeNull();
    expect(clock.CLOCK_FIT_ELIGIBLE_LANDMARKS).toEqual([]);
    expect(extractProvisionalLandmarkHDisplacement(landmarkMatches)).toBe(22.205);
    expect(APPROXIMATE_NON_UNIQUE_LANDMARK_CANNOT_DEFINE_PROVIDER_CLOCK_OFFSET).toBe('YES');
  });

  it('25) Segment A provider offset remains null with no authoritative clock-fit landmarks', () => {
    const episodes = [
      makeEpisode({
        type: 'low_speed',
        startTimestamp: '2026-09-04T03:43:48.205Z',
        startSpeedKmh: 15,
        videoRelativeStart: 362.205,
      }),
    ];
    const matches = matchVideoLandmarks(VIDEO_LANDMARKS, episodes);
    const clock = estimateClockAlignment(matches);
    expect(clock.VIDEO_TO_PROVIDER_OFFSET_SECONDS).toBeNull();
    expect(clock.CLOCK_FIT_ELIGIBLE_LANDMARKS).toEqual([]);
    expect(clock.VIDEO_PROVIDER_ALIGNMENT_CLASS).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('26) exploratory H displacement is preserved separately from provider offset', () => {
    const landmarkMatches = [
      {
        landmarkId: 'H',
        CLOCK_FIT_ELIGIBLE: 'NO',
        exploratoryDisplacementSeconds: 22.205,
        exploratoryDisplacementClassification: 'NOT_A_CLOCK_OFFSET_ESTIMATE',
      },
    ];
    const clock = estimateClockAlignment(landmarkMatches);
    expect(clock.PROVISIONAL_LANDMARK_H_DISPLACEMENT_SECONDS).toBe(22.205);
    expect(clock.PROVISIONAL_LANDMARK_H_DISPLACEMENT_VALIDATED).toBe('NO');
    expect(clock.PROVISIONAL_LANDMARK_H_DISPLACEMENT_NOTE).toBe('NOT_A_CLOCK_OFFSET_ESTIMATE');
    expect(clock.VIDEO_TO_PROVIDER_OFFSET_SECONDS).toBeNull();
  });

  it('27) true local peak attenuation compares independent maxima in same local window', () => {
    const points: QualifiedSpeedPoint[] = [
      { acquisitionOrdinal: 1, providerTimestamp: '2026-09-04T03:37:46.000Z', speedKmh: 10, videoRelativeSecondsProvisional: 0, flags: [] },
      { acquisitionOrdinal: 2, providerTimestamp: '2026-09-04T03:38:00.000Z', speedKmh: 30, videoRelativeSecondsProvisional: 14, flags: [] },
      { acquisitionOrdinal: 3, providerTimestamp: '2026-09-04T03:38:02.000Z', speedKmh: 50, videoRelativeSecondsProvisional: 16, flags: [] },
      { acquisitionOrdinal: 4, providerTimestamp: '2026-09-04T03:38:04.000Z', speedKmh: 30, videoRelativeSecondsProvisional: 18, flags: [] },
      { acquisitionOrdinal: 5, providerTimestamp: '2026-09-04T03:38:06.000Z', speedKmh: 10, videoRelativeSecondsProvisional: 20, flags: [] },
    ];
    const sidecar = points.map((p) => ({
      providerTimestamp: p.providerTimestamp,
      qualifiedRawHfSpeedKmh: p.speedKmh,
      legacy3PointSmoothedSpeedKmh:
        p.videoRelativeSecondsProvisional === 16 ? 35 : p.speedKmh * 0.9,
    }));
    const result = comparePreprocessingResponse(points, sidecar);
    expect(result.TRUE_LOCAL_PEAK_EVENT_COUNT).toBeGreaterThan(0);
    expect(result.TRUE_LOCAL_PEAK_ATTENUATION_KMH).toBe(15);
    expect(result.MAX_SAME_TIMESTAMP_RAW_SMOOTHED_DELTA_KMH).toBe(15);
    expect(result.TRUE_LOCAL_PEAK_ATTENUATION_DOES_NOT_USE_SAME_TIMESTAMP_PROXY).toBe('YES');
    expect(TRUE_LOCAL_PEAK_ATTENUATION_DOES_NOT_USE_SAME_TIMESTAMP_PROXY).toBe('YES');
  });

  it('28) shifted smoothed peak is handled correctly', () => {
    const points: QualifiedSpeedPoint[] = [
      { acquisitionOrdinal: 1, providerTimestamp: '2026-09-04T03:37:46.000Z', speedKmh: 10, videoRelativeSecondsProvisional: 0, flags: [] },
      { acquisitionOrdinal: 2, providerTimestamp: '2026-09-04T03:38:00.000Z', speedKmh: 30, videoRelativeSecondsProvisional: 14, flags: [] },
      { acquisitionOrdinal: 3, providerTimestamp: '2026-09-04T03:38:02.000Z', speedKmh: 50, videoRelativeSecondsProvisional: 16, flags: [] },
      { acquisitionOrdinal: 4, providerTimestamp: '2026-09-04T03:38:04.000Z', speedKmh: 45, videoRelativeSecondsProvisional: 18, flags: [] },
      { acquisitionOrdinal: 5, providerTimestamp: '2026-09-04T03:38:06.000Z', speedKmh: 30, videoRelativeSecondsProvisional: 20, flags: [] },
    ];
    const sidecar = points.map((p) => ({
      providerTimestamp: p.providerTimestamp,
      qualifiedRawHfSpeedKmh: p.speedKmh,
      legacy3PointSmoothedSpeedKmh:
        p.videoRelativeSecondsProvisional === 18 ? 48 : p.speedKmh * 0.8,
    }));
    const legacyByTs = new Map(sidecar.map((r) => [r.providerTimestamp, r]));
    const events = computeTrueLocalPeakEvents(points, legacyByTs);
    expect(events.length).toBeGreaterThan(0);
    const event = events.find((e) => e.rawLocalPeakValueKmh === 50)!;
    expect(event.smoothedLocalPeakTimeSeconds).toBe(18);
    expect(event.rawLocalPeakTimeSeconds).toBe(16);
    expect(event.localPeakTimeShiftSeconds).toBe(2);
    expect(event.localPeakAttenuationKmh).toBe(2);
    const result = comparePreprocessingResponse(points, sidecar);
    expect(result.MAX_SAME_TIMESTAMP_RAW_SMOOTHED_DELTA_KMH).toBe(10);
    expect(result.TRUE_LOCAL_PEAK_ATTENUATION_KMH).toBe(2);
    expect(result.LOCAL_PEAK_TIME_SHIFT_AVAILABLE).toBe('YES');
  });

  it('29) same-timestamp delta remains separate from true local peak attenuation', () => {
    const points: QualifiedSpeedPoint[] = [
      { acquisitionOrdinal: 1, providerTimestamp: '2026-09-04T03:37:46.000Z', speedKmh: 10, videoRelativeSecondsProvisional: 0, flags: [] },
      { acquisitionOrdinal: 2, providerTimestamp: '2026-09-04T03:38:00.000Z', speedKmh: 40, videoRelativeSecondsProvisional: 14, flags: [] },
      { acquisitionOrdinal: 3, providerTimestamp: '2026-09-04T03:38:02.000Z', speedKmh: 50, videoRelativeSecondsProvisional: 16, flags: [] },
      { acquisitionOrdinal: 4, providerTimestamp: '2026-09-04T03:38:04.000Z', speedKmh: 40, videoRelativeSecondsProvisional: 18, flags: [] },
    ];
    const sidecar = points.map((p) => ({
      providerTimestamp: p.providerTimestamp,
      qualifiedRawHfSpeedKmh: p.speedKmh,
      legacy3PointSmoothedSpeedKmh:
        p.videoRelativeSecondsProvisional === 16
          ? 45
          : p.videoRelativeSecondsProvisional === 18
            ? 47
            : p.speedKmh,
    }));
    const result = comparePreprocessingResponse(points, sidecar);
    expect(result.MAX_SAME_TIMESTAMP_RAW_SMOOTHED_DELTA_KMH).toBe(7);
    expect(result.TRUE_LOCAL_PEAK_ATTENUATION_KMH).toBe(3);
  });

  (hasSourceData ? it : it.skip)('30) sealed source observations SHA unchanged', () => {
    const content = fs.readFileSync(SOURCE_OBS, 'utf8');
    const sha = crypto.createHash('sha256').update(content).digest('hex');
    expect(sha).toBe(SEGMENT_A_CONSTANTS.sealedEvidenceSha256);
  });

  it('31) production runtime unchanged flags', () => {
    const result = runRd004SegmentAAnalysis({ observations: [], legacySidecar: [] });
    expect(result.flags.PRODUCTION_SCORE_CHANGED).toBe('NO');
    expect(result.flags.PRODUCTION_DETECTORS_CHANGED).toBe('NO');
    expect(result.flags.TIRE_RUNTIME_CHANGED).toBe('NO');
    expect(result.flags.BRAKE_RUNTIME_CHANGED).toBe('NO');
    expect(result.flags.DEPLOYED).toBe('NO');
  });
});

function containsNoEnvPaths(p: string): boolean {
  return !p.includes('/workspace/') && !p.includes('/tmp/') && !p.includes('/home/cursor/');
}
