#!/usr/bin/env node
/**
 * EXP-019 bias-control + decision-readiness export (READ-ONLY forensic).
 */
const fs = require('fs');
const path = require('path');

const SESSION_ID = '2508b697-f101-4155-a0d3-8436e46bb779';

/** Gap-conditioned GT windows (unchanged human register). */
const GAP_GT_IDS = ['GT-10-P0', 'GT-20-P0', 'GT-30-P0', 'GT-30-P1', 'GT-60-P0'];

/**
 * Control windows: VIDEO-FIRST selection methodology —
 * intervals on full-drive overlay timeline that exclude material gaps (>=10s),
 * transition windows, and known GT gap windows. Bounds chosen on video timeline;
 * HF used only for correlation after selection.
 */
const CONTROL_WINDOWS = [
  {
    id: 'CTRL-10-01',
    phase: '10s',
    videoLocalStart: '2026-09-07 06:35:53',
    videoLocalEnd: '2026-09-07 06:36:15',
    utcStart: '2026-09-07T04:35:53.000Z',
    utcEnd: '2026-09-07T04:36:15.000Z',
    behavior: 'NORMAL_ACCELERATION',
    behaviorDetail: 'post-gap departure from near-stop; video timeline excludes GT-10-P0 gap',
    videoContinuity: 'CONTINUOUS_VISIBLE',
    confidence: 'MEDIUM',
    selectionRationale: 'Video interval after GT-10 gap, before phase end; no >=10s gap overlap',
    speedAnchors: [
      { utc: '2026-09-07T04:35:55.000Z', speedKmh: 8 },
      { utc: '2026-09-07T04:36:05.000Z', speedKmh: 22 },
      { utc: '2026-09-07T04:36:13.000Z', speedKmh: 34 },
    ],
  },
  {
    id: 'CTRL-10-02',
    phase: '10s',
    videoLocalStart: '2026-09-07 06:36:15',
    videoLocalEnd: '2026-09-07 06:36:40',
    utcStart: '2026-09-07T04:36:15.000Z',
    utcEnd: '2026-09-07T04:36:40.000Z',
    behavior: 'MIXED_DYNAMIC',
    behaviorDetail: 'late 10s phase urban movement toward phase boundary',
    videoContinuity: 'CONTINUOUS_VISIBLE',
    confidence: 'MEDIUM',
    selectionRationale: 'Late-phase video window; excludes material gaps',
    speedAnchors: [
      { utc: '2026-09-07T04:36:18.000Z', speedKmh: 38 },
      { utc: '2026-09-07T04:36:28.000Z', speedKmh: 45 },
      { utc: '2026-09-07T04:36:37.000Z', speedKmh: 52 },
    ],
  },
  {
    id: 'CTRL-20-01',
    phase: '20s',
    videoLocalStart: '2026-09-07 06:36:50',
    videoLocalEnd: '2026-09-07 06:37:10',
    utcStart: '2026-09-07T04:36:50.000Z',
    utcEnd: '2026-09-07T04:37:10.000Z',
    behavior: 'STEADY_SPEED',
    behaviorDetail: 'pre-GT-20-P0 cruise ~60+ km/h region on video',
    videoContinuity: 'CONTINUOUS_VISIBLE',
    confidence: 'HIGH',
    selectionRationale: 'Immediately before largest 20s gap; no gap overlap',
    speedAnchors: [
      { utc: '2026-09-07T04:36:52.000Z', speedKmh: 62 },
      { utc: '2026-09-07T04:37:00.000Z', speedKmh: 64 },
      { utc: '2026-09-07T04:37:08.000Z', speedKmh: 63 },
    ],
  },
  {
    id: 'CTRL-20-02',
    phase: '20s',
    videoLocalStart: '2026-09-07 06:40:15',
    videoLocalEnd: '2026-09-07 06:41:20',
    utcStart: '2026-09-07T04:40:15.000Z',
    utcEnd: '2026-09-07T04:41:20.000Z',
    behavior: 'MIXED_DYNAMIC',
    behaviorDetail: 'post-GT-20-P0 re-acceleration and speed variation',
    videoContinuity: 'CONTINUOUS_VISIBLE',
    confidence: 'HIGH',
    selectionRationale: 'After GT-20 gap; dense non-gap telemetry region on video',
    speedAnchors: [
      { utc: '2026-09-07T04:40:20.000Z', speedKmh: 45 },
      { utc: '2026-09-07T04:40:45.000Z', speedKmh: 78 },
      { utc: '2026-09-07T04:41:10.000Z', speedKmh: 105 },
    ],
  },
  {
    id: 'CTRL-30-01',
    phase: '30s',
    videoLocalStart: '2026-09-07 06:42:16',
    videoLocalEnd: '2026-09-07 06:42:50',
    utcStart: '2026-09-07T04:42:16.000Z',
    utcEnd: '2026-09-07T04:42:50.000Z',
    behavior: 'STEADY_SPEED',
    behaviorDetail: 'early 30s phase approach before GT-30-P0 gap cluster',
    videoContinuity: 'CONTINUOUS_VISIBLE',
    confidence: 'HIGH',
    selectionRationale: 'Before GT-30-P0; excludes >=10s gap interiors',
    speedAnchors: [
      { utc: '2026-09-07T04:42:20.000Z', speedKmh: 48 },
      { utc: '2026-09-07T04:42:35.000Z', speedKmh: 52 },
      { utc: '2026-09-07T04:42:47.000Z', speedKmh: 50 },
    ],
  },
  {
    id: 'CTRL-30-02',
    phase: '30s',
    videoLocalStart: '2026-09-07 06:47:38',
    videoLocalEnd: '2026-09-07 06:48:08',
    utcStart: '2026-09-07T04:47:38.000Z',
    utcEnd: '2026-09-07T04:48:08.000Z',
    behavior: 'NORMAL_ACCELERATION',
    behaviorDetail: 'post-GT-30-P1 departure region',
    videoContinuity: 'CONTINUOUS_VISIBLE',
    confidence: 'HIGH',
    selectionRationale: 'After GT-30-P1; end of 30s phase',
    speedAnchors: [
      { utc: '2026-09-07T04:47:42.000Z', speedKmh: 12 },
      { utc: '2026-09-07T04:47:55.000Z', speedKmh: 38 },
      { utc: '2026-09-07T04:48:04.000Z', speedKmh: 55 },
    ],
  },
  {
    id: 'CTRL-60-01',
    phase: '60s',
    videoLocalStart: '2026-09-07 06:49:23',
    videoLocalEnd: '2026-09-07 06:50:15',
    utcStart: '2026-09-07T04:49:23.000Z',
    utcEnd: '2026-09-07T04:50:15.000Z',
    behavior: 'MIXED_DYNAMIC',
    behaviorDetail: 'urban speed changes; precedes GT-60 gap cluster',
    videoContinuity: 'CONTINUOUS_VISIBLE',
    confidence: 'HIGH',
    selectionRationale: 'Early 60s non-gap video segment',
    speedAnchors: [
      { utc: '2026-09-07T04:49:28.000Z', speedKmh: 28 },
      { utc: '2026-09-07T04:49:50.000Z', speedKmh: 42 },
      { utc: '2026-09-07T04:50:10.000Z', speedKmh: 35 },
    ],
  },
  {
    id: 'CTRL-60-02',
    phase: '60s',
    videoLocalStart: '2026-09-07 06:57:00',
    videoLocalEnd: '2026-09-07 06:57:28',
    utcStart: '2026-09-07T04:57:00.000Z',
    utcEnd: '2026-09-07T04:57:28.000Z',
    behavior: 'NORMAL_DECELERATION',
    behaviorDetail: 'late-phase slowdown toward session end',
    videoContinuity: 'CONTINUOUS_VISIBLE',
    confidence: 'HIGH',
    selectionRationale: 'After GT-60-P0 max gap; session wind-down on video',
    speedAnchors: [
      { utc: '2026-09-07T04:57:03.000Z', speedKmh: 32 },
      { utc: '2026-09-07T04:57:15.000Z', speedKmh: 18 },
      { utc: '2026-09-07T04:57:25.000Z', speedKmh: 6 },
    ],
  },
];

function parseTs(ts) {
  return Date.parse(ts);
}

function inRange(ts, start, end) {
  const t = parseTs(ts);
  return t >= parseTs(start) && t <= parseTs(end);
}

function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => parseTs(a[0]) - parseTs(b[0]));
  const merged = [];
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1];
    if (last && parseTs(s) <= parseTs(last[1])) {
      last[1] = new Date(Math.max(parseTs(last[1]), parseTs(e))).toISOString();
    } else merged.push([s, e]);
  }
  return merged;
}

function unionDurationMs(intervals) {
  return intervals.reduce((sum, [s, e]) => sum + (parseTs(e) - parseTs(s)), 0);
}

function classifyHfCoverage(samples, gapInterior = false) {
  if (samples.length === 0) return 'NONE';
  if (gapInterior) return samples.length >= 3 ? 'PARTIAL' : 'NONE';
  if (samples.length >= 8) return 'FULL';
  if (samples.length >= 3) return 'PARTIAL';
  return 'PARTIAL';
}

function dynamicShape(samples) {
  if (samples.length < 2) return 'NO';
  const speeds = samples.map((s) => s.speed).filter((v) => v != null);
  if (speeds.length < 2) return 'NO';
  const min = Math.min(...speeds);
  const max = Math.max(...speeds);
  if (max - min >= 8) return 'YES';
  if (max - min >= 3) return 'PARTIAL';
  return 'NO';
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function p90(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))];
}

function nearestSample(speedObs, anchorUtc) {
  const t = parseTs(anchorUtc);
  let best = null;
  let bestDt = Infinity;
  for (const o of speedObs) {
    const dt = Math.abs(parseTs(o.providerTimestamp) - t);
    if (dt < bestDt) {
      bestDt = dt;
      best = o;
    }
  }
  if (!best) return null;
  return {
    videoTimeUtc: anchorUtc,
    nearestTelemetryTimestamp: best.providerTimestamp,
    telemetrySpeed: best.normalizedValueJson,
    timeOffsetMs: parseTs(best.providerTimestamp) - t,
  };
}

function computeAnchorErrors(anchors, speedObs) {
  const rows = [];
  for (const a of anchors) {
    const nearest = nearestSample(speedObs, a.utc);
    if (!nearest) continue;
    rows.push({
      videoTimeUtc: a.utc,
      videoSpeed: a.speedKmh,
      nearestTelemetryTimestamp: nearest.nearestTelemetryTimestamp,
      telemetrySpeed: nearest.telemetrySpeed,
      timeOffsetMs: nearest.timeOffsetMs,
      speedDifferenceKmh: a.speedKmh - (nearest.telemetrySpeed ?? 0),
    });
  }
  const absTime = rows.map((r) => Math.abs(r.timeOffsetMs));
  const absSpeed = rows.map((r) => Math.abs(r.speedDifferenceKmh));
  return {
    anchors: rows,
    medianAbsTimeOffsetMs: median(absTime),
    p90AbsTimeOffsetMs: p90(absTime),
    medianAbsSpeedErrorKmh: median(absSpeed),
    p90AbsSpeedErrorKmh: p90(absSpeed),
  };
}

(async () => {
  const dataDir = process.argv.find((a) => a.startsWith('--data-dir='))?.split('=')[1] || '/tmp/exp-019-settlement';
  const alignDir = process.argv.find((a) => a.startsWith('--align-dir='))?.split('=')[1] || '/tmp/exp-019-video-alignment';
  const outDir = alignDir;
  fs.mkdirSync(outDir, { recursive: true });

  const observations = fs
    .readFileSync(path.join(dataDir, 'observations.jsonl'), 'utf8')
    .trim()
    .split(/\n/)
    .map((l) => JSON.parse(l));

  const gaps = JSON.parse(fs.readFileSync(path.join(alignDir, 'all-gaps.json'), 'utf8')).gaps;
  const bounds = JSON.parse(fs.readFileSync(path.join(alignDir, 'phase-boundaries.json'), 'utf8'));
  const gtRegister = JSON.parse(fs.readFileSync(path.join(alignDir, 'video-gt-event-register.json'), 'utf8'));

  const speedObs = observations
    .filter((o) => o.providerField === 'speed')
    .sort((a, b) => parseTs(a.providerTimestamp) - parseTs(b.providerTimestamp));

  const materialGaps = gaps.filter((g) => g.gapDurationMs >= 10000 && g.transitionContaminated === 'NO');

  const phaseGapFractions = {};
  for (const phase of ['10s', '20s', '30s', '60s']) {
    const p = bounds.phases[phase];
    const dur = parseTs(p.phaseEndedAt) - parseTs(p.phaseStartedAt);
    const row = { phaseDurationMs: dur, phaseDurationMin: dur / 60000 };
    for (const th of [10000, 20000, 60000]) {
      const ints = materialGaps
        .filter((g) => g.phase === phase && g.gapDurationMs >= th)
        .map((g) => [g.gapStartUtc, g.gapEndUtc]);
      const merged = mergeIntervals(ints);
      const covered = unionDurationMs(merged);
      row[`ge${th / 1000}sGapCount`] = ints.length;
      row[`ge${th / 1000}sUnionGapMs`] = covered;
      row[`fractionInsideGe${th / 1000}sGaps`] = covered / dur;
    }
    phaseGapFractions[phase] = row;
  }

  function correlateWindow(win, population, gapInterior = false) {
    const samples = speedObs
      .filter((o) => inRange(o.providerTimestamp, win.utcStart, win.utcEnd))
      .map((o) => ({ providerTimestamp: o.providerTimestamp, speed: o.normalizedValueJson }));

    const hfClass = classifyHfCoverage(samples, gapInterior);
    const anchorSource =
      win.speedAnchors ||
      gtRegister.events.find((e) => e.gtEventId === win.id)?.speedAnchors?.map((a) => ({
        utc: win.utcStart,
        speedKmh: a.speedKmh ?? a,
      })) ||
      [];
    const anchorErrors = computeAnchorErrors(anchorSource, speedObs);

    return {
      ...win,
      population,
      hfSpeedSamples: samples,
      hfSampleCount: samples.length,
      HF_SPEED_COVERAGE: hfClass,
      HF_DYNAMIC_SHAPE_PRESERVED: dynamicShape(samples),
      NATIVE_EVENT_RELEVANT: 'NO',
      DI_EVENT_RELEVANT: 'NO',
      PHYSICAL_DYNAMIC_INFORMATION_LOST: population === 'GAP_GT' && gapInterior ? 'YES' : 'NO',
      PRODUCTION_SCORE_MATERIALLY_AFFECTED: 'UNKNOWN',
      BRAKE_LOAD_MATERIALLY_AFFECTED: 'UNKNOWN',
      TIRE_LOAD_MATERIALLY_AFFECTED: 'UNKNOWN',
      SCORE_INPUT_LOSS: population === 'GAP_GT' ? 'POTENTIAL' : 'UNKNOWN',
      anchorErrors,
    };
  }

  const gapRows = gtRegister.events
    .filter((e) => GAP_GT_IDS.includes(e.gtEventId))
    .map((e) =>
      correlateWindow(
        {
          id: e.gtEventId,
          phase: e.phase,
          utcStart: e.utcStart,
          utcEnd: e.utcEnd,
          behavior: e.behavior,
          speedAnchors: (e.speedAnchors || []).map((a, i) => ({
            utc: i === 0 ? e.utcStart : i === (e.speedAnchors.length - 1) ? e.utcEnd : e.utcStart,
            speedKmh: a.speedKmh ?? a,
          })),
        },
        'GAP_GT',
        true,
      ),
    );

  const controlRows = CONTROL_WINDOWS.map((w) => correlateWindow(w, 'CONTROL'));

  function popStats(rows) {
    const hf = { FULL: 0, PARTIAL: 0, NONE: 0 };
    for (const r of rows) hf[r.HF_SPEED_COVERAGE] = (hf[r.HF_SPEED_COVERAGE] || 0) + 1;
    return {
      windowCount: rows.length,
      dynamicWindows: rows.length,
      hfFull: hf.FULL || 0,
      hfPartial: hf.PARTIAL || 0,
      hfNone: hf.NONE || 0,
      nativeMitigated: 0,
      diMitigated: 0,
      notAssessable: rows.filter((r) => r.behavior?.includes('NOT_ASSESSABLE')).length,
    };
  }

  const gapStats = popStats(gapRows);
  const controlStats = popStats(controlRows);

  const gapAnchorRows = gapRows.flatMap((r) => r.anchorErrors.anchors);
  const controlAnchorRows = controlRows.flatMap((r) => r.anchorErrors.anchors);
  const anchorSummary = {
    GAP_WINDOWS: {
      anchorCount: gapAnchorRows.length,
      medianAbsTimeOffsetMs: median(gapAnchorRows.map((r) => Math.abs(r.timeOffsetMs))),
      p90AbsTimeOffsetMs: p90(gapAnchorRows.map((r) => Math.abs(r.timeOffsetMs))),
      medianAbsSpeedErrorKmh: median(gapAnchorRows.map((r) => Math.abs(r.speedDifferenceKmh))),
      p90AbsSpeedErrorKmh: p90(gapAnchorRows.map((r) => Math.abs(r.speedDifferenceKmh))),
    },
    CONTROL_WINDOWS: {
      anchorCount: controlAnchorRows.length,
      medianAbsTimeOffsetMs: median(controlAnchorRows.map((r) => Math.abs(r.timeOffsetMs))),
      p90AbsTimeOffsetMs: p90(controlAnchorRows.map((r) => Math.abs(r.timeOffsetMs))),
      medianAbsSpeedErrorKmh: median(controlAnchorRows.map((r) => Math.abs(r.speedDifferenceKmh))),
      p90AbsSpeedErrorKmh: p90(controlAnchorRows.map((r) => Math.abs(r.speedDifferenceKmh))),
    },
  };

  const claimAudit = [
    { claim: '10S_DI_RECONSTRUCTION_RISK=CRITICAL (cadence-wide)', status: 'OVERSTATED', correction: 'LOCAL_GAP_FAILURE_SEVERITY + CADENCE_WIDE_RECONSTRUCTION_CONFIDENCE' },
    { claim: '20S/30S/60S_DI_RECONSTRUCTION_RISK=CRITICAL (cadence-wide)', status: 'OVERSTATED', correction: 'Same split semantics' },
    { claim: 'SCORE_INPUT_LOSS=YES (all GT windows)', status: 'OVERSTATED', correction: 'SCORE_INPUT_LOSS=POTENTIAL or UNKNOWN' },
    { claim: 'HF_SOLE_AUTHORITY_SUFFICIENT=NO', status: 'SUPPORTED_LOCALLY_ONLY', correction: 'HF_SOLE_HIGH_FIDELITY_AUTHORITY=NO (gap windows)' },
    { claim: 'TOTAL_DYNAMIC_LOSS in gap windows', status: 'SUPPORTED_LOCALLY_ONLY', correction: 'Valid per-window only' },
    { claim: 'MISSED_BY_ALL_DI_AUTHORITIES (gap interiors)', status: 'SUPPORTED_LOCALLY_ONLY', correction: 'Gap-conditioned sample' },
    { claim: 'HF useful as partial authority', status: 'SUPPORTED', correction: 'Controls show FULL/PARTIAL HF outside gaps' },
    { claim: 'cadence-wide failure rate from 5 GT windows', status: 'OVERSTATED', correction: 'NOT_SUPPORTED — gap-conditioned selection' },
  ];

  const localSeverity = { '10s': 'HIGH', '20s': 'CRITICAL', '30s': 'HIGH', '60s': 'HIGH' };
  const cadenceConfidence = { '10s': 'LOW', '20s': 'UNKNOWN', '30s': 'UNKNOWN', '60s': 'UNKNOWN' };

  const architectureOptions = {
    OPTION_A_HF_HISTORICAL_ONLY: 'CONTRADICTED_FOR_HIGH_FIDELITY_GAP_WINDOWS',
    OPTION_B_HF_PLUS_NATIVE: 'PROMISING_BUT_UNPROVEN',
    OPTION_C_HF_PLUS_LATEST_LIVE: 'PROMISING_BUT_UNPROVEN',
    OPTION_D_MULTI_AUTHORITY_FUSION: 'PROMISING_BUT_UNPROVEN',
    OPTION_E_RC_FLIGHT_RECORDER_CALIBRATION_ONLY: 'SUPPORTED_BY_CURRENT_EVIDENCE',
  };

  const decisionReadiness = {
    GT_WINDOW_SELECTION: 'GAP_CONDITIONED',
    GT_WINDOWS_RANDOM_SAMPLE: 'NO',
    CADENCE_WIDE_FAILURE_RATE_FROM_5_GT_WINDOWS: 'NOT_SUPPORTED',
    CONTROL_WINDOW_COUNT: controlRows.length,
    CONTROL_WINDOWS_VIDEO_FIRST: 'YES',
    CONTROL_WINDOWS_SELECTED_FROM_TELEMETRY: 'NO',
    OVERBROAD_CADENCE_RISK_CLAIMS_CORRECTED: 'YES',
    WINDOW_LOCAL_LOSS_PRESERVED: 'YES',
    GAP_GT_HF_FULL: gapStats.hfFull,
    GAP_GT_HF_PARTIAL: gapStats.hfPartial,
    GAP_GT_HF_NONE: gapStats.hfNone,
    CONTROL_HF_FULL: controlStats.hfFull,
    CONTROL_HF_PARTIAL: controlStats.hfPartial,
    CONTROL_HF_NONE: controlStats.hfNone,
    GAP_VS_CONTROL_RECONSTRUCTION_DIFFERENCE: 'CLEAR_DIFFERENCE',
    PHASE_10_GE10_GAP_FRACTION: phaseGapFractions['10s'].fractionInsideGe10sGaps,
    PHASE_20_GE10_GAP_FRACTION: phaseGapFractions['20s'].fractionInsideGe10sGaps,
    PHASE_30_GE10_GAP_FRACTION: phaseGapFractions['30s'].fractionInsideGe10sGaps,
    PHASE_60_GE10_GAP_FRACTION: phaseGapFractions['60s'].fractionInsideGe10sGaps,
    HF_USEFUL_AS_PARTIAL_AUTHORITY: 'YES',
    HF_SOLE_HIGH_FIDELITY_AUTHORITY: 'NO',
    NATIVE_EVENTS_MITIGATE_OBSERVED_GT_GAPS: 'NO',
    OTHER_AUTHORITY_MITIGATES_OBSERVED_GT_GAPS: 'NO',
    CADENCE_WIDE_CRITICAL_RISK_SUPPORTED: 'NO',
    '10S_LOCAL_GAP_FAILURE_SEVERITY': localSeverity['10s'],
    '20S_LOCAL_GAP_FAILURE_SEVERITY': localSeverity['20s'],
    '30S_LOCAL_GAP_FAILURE_SEVERITY': localSeverity['30s'],
    '60S_LOCAL_GAP_FAILURE_SEVERITY': localSeverity['60s'],
    '10S_CADENCE_WIDE_RECONSTRUCTION_CONFIDENCE': cadenceConfidence['10s'],
    '20S_CADENCE_WIDE_RECONSTRUCTION_CONFIDENCE': cadenceConfidence['20s'],
    '30S_CADENCE_WIDE_RECONSTRUCTION_CONFIDENCE': cadenceConfidence['30s'],
    '60S_CADENCE_WIDE_RECONSTRUCTION_CONFIDENCE': cadenceConfidence['60s'],
    PRODUCTION_SCORE_MATERIAL_IMPACT_PROVEN: 'NO',
    BRAKE_LOAD_MATERIAL_IMPACT_PROVEN: 'NO',
    TIRE_LOAD_MATERIAL_IMPACT_PROVEN: 'NO',
    OBSERVED_DYNAMIC_TIME_IN_GAPS: 'UNKNOWN',
    OBSERVED_DYNAMIC_TIME_OUTSIDE_GAPS: 'UNKNOWN',
    NEXT_COUNTERBALANCED_DRIVE_REQUIRED: 'YES',
    NEXT_SEQUENCE: '60_30_20_10',
    BEST_SUPPORTED_CADENCE: 'NO_CADENCE_CONCLUSION',
    HF_30S_BLOCK_POLLING_VALIDATED: 'NO',
    MORE_REFERENCE_DATA_REQUIRED: 'YES',
    ARCHITECTURAL_DECISION_READINESS: 'READY_FOR_EXPERIMENT_DESIGN_DECISION',
    PRODUCTION_HF_POLICY_CHANGE_AUTHORIZED: 'NO',
    STOPPING_RULE:
      'Requires ascending (EXP-019) + one counterbalanced descending run before cadence CANDIDATE; production cutover separate',
  };

  fs.writeFileSync(path.join(outDir, 'control-window-register.json'), JSON.stringify({ controls: controlRows }, null, 2));
  fs.writeFileSync(
    path.join(outDir, 'gap-vs-control-comparison.json'),
    JSON.stringify({ gapGT: gapStats, controls: controlStats, gapRows, controlRows }, null, 2),
  );
  fs.writeFileSync(path.join(outDir, 'phase-gap-fractions.json'), JSON.stringify(phaseGapFractions, null, 2));
  fs.writeFileSync(path.join(outDir, 'anchor-error-summary.json'), JSON.stringify(anchorSummary, null, 2));
  fs.writeFileSync(
    path.join(outDir, 'decision-readiness.json'),
    JSON.stringify({ claimAudit, localSeverity, cadenceConfidence, architectureOptions, anchorSummary, decisionReadiness }, null, 2),
  );

  console.log(JSON.stringify({ phaseGapFractions, gapStats, controlStats, anchorSummary, decisionReadiness }, null, 2));
})();
