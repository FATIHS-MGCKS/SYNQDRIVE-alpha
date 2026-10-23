#!/usr/bin/env node
'use strict';
/**
 * TIG22 deep validation — offline, reproducible, no production access.
 *
 *   node scripts/run_tig22_deep_validation.cjs [--code-root <checkout>] [--expect-sha <sha>]
 *
 * Code-root must be clean under driving-intelligence/ (default: repo root at origin/main).
 * Primary algorithm pin: production release 716f93fedd9d5408fa1db2de5b4cd1a786d9685c.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const evalRoot = path.resolve(__dirname, '..');
const speedEvalRoot = path.resolve(evalRoot, '../ds4-speed-video-reference-20261023');
const repoRoot = path.resolve(evalRoot, '../../../..');
const L = require(path.join(speedEvalRoot, 'scripts/eval_lib.cjs'));
const E = require('./event_eval_lib.cjs');

const PROD_SHA = '716f93fedd9d5408fa1db2de5b4cd1a786d9685c';
const VIDEO_GT_LAST_UTC = '2026-10-22T19:03:02Z';
const VIDEO_GT_LAST_SEC = L.secOf(VIDEO_GT_LAST_UTC);
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const codeRoot = path.resolve(opt('--code-root', repoRoot));
const expectSha = opt('--expect-sha', PROD_SHA);
const outDir = path.join(evalRoot, 'outputs');
const DI = 'backend/src/modules/vehicle-intelligence/driving-intelligence';

const codeSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: codeRoot }).toString().trim();
const mainSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).toString().trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--', DI], { cwd: codeRoot }).toString().trim();
if (dirty) throw new Error(`DI not clean in ${codeRoot}:\n${dirty}`);
if (expectSha && codeSha !== expectSha) throw new Error(`code-root ${codeSha} != expect ${expectSha}`);

const nodeRoot = fs.existsSync(path.join(codeRoot, 'backend/node_modules/ts-node'))
  ? codeRoot
  : repoRoot;
require(path.join(nodeRoot, 'backend/node_modules/ts-node')).register({
  transpileOnly: true,
  project: path.join(codeRoot, 'backend/tsconfig.json'),
});
const req = (rel) => require(path.join(codeRoot, DI, rel));
const { parseDiV0S4EvidenceContainer } = req('s4a-foundation/di-v0-s4a-evidence-container-parse.ts');
const { processDiV0MotionCoreShadowTrip } = req('motion-core-shadow-worker/di-v0-motion-core-shadow-processor.ts');
const { adaptMotionCoreShadowEvidenceFromParsedContainer } = req('motion-core-shadow-worker/di-v0-motion-core-shadow-evidence.adapter.ts');
const { buildDiV0S4dS1InputFromParsedContainer } = req('s4d-replay/di-v0-s4d-replay-s1.ts');
const { buildDiV0TripSpeedQualityEvidenceFromParsedContainer } = req('trip-speed-quality/di-v0-trip-speed-quality-evidence.ts');
const { evaluateDiV0SpeedQcInterval } = req('speed-qc/evaluate-di-v0-speed-qc-interval.ts');
const { DI_V0_SPEED_QC_POLICY_V2 } = req('speed-qc/di-v0-speed-qc-policy.version.ts');
const core = req('core/index.ts');

const GUARDS = core.MOTION_CORE_EVENT_GUARDS_V0_1_DEV;
const THR = core.MOTION_EVENT_HF_THRESHOLDS_V1;
const OPTIONS = core.MOTION_EVENT_V0_2_CANDIDATE_OPTIONS;

function sha256File(f) {
  return createHash('sha256').update(fs.readFileSync(f)).digest('hex');
}

function readSpeedInput(rel) {
  return fs.readFileSync(path.join(speedEvalRoot, 'inputs', rel));
}

function diV0Replay(s1Input) {
  const out = core.computeDiV0TripIntervals(s1Input, {
    versions: core.DEFAULT_DI_V0_VERSION_TUPLE,
    calibration: core.CALIBRATION_UNSET_V0_BUNDLE,
  });
  const map = new Map();
  for (const iv of out.intervals) {
    map.set(L.secOf(iv.intervalStart), {
      speed: iv.estimatedSpeedKmh,
      state: iv.motionState,
      positionState: iv.positionState,
      abstention: iv.abstentionReason,
      speedEvidenceState: iv.speedEvidenceState,
    });
  }
  return { map, intervals: out.intervals, warnings: out.warnings };
}

function qcReplay(intervals, positions, r1Obd, pinnedSnapshotHash) {
  const map = new Map();
  for (const iv of intervals) {
    const centerBucketLabel = L.labelOf(Date.parse(iv.referenceTime));
    const v = evaluateDiV0SpeedQcInterval({
      centerBucketLabel,
      shadow: {
        intervalStart: iv.intervalStart,
        intervalEnd: iv.intervalEnd,
        referenceTime: iv.referenceTime,
        estimatedSpeedKmh: iv.estimatedSpeedKmh,
        speedEvidenceState: iv.speedEvidenceState,
        valueConfidence: iv.valueConfidence,
        sourceRelation: iv.sourceRelation,
        motionState: iv.motionState,
        positionState: iv.positionState,
        abstentionReason: iv.abstentionReason,
        sourceQualityFlags: iv.sourceQualityFlags,
        evidenceSources: iv.evidenceSources,
      },
      positions,
      r1Obd,
      evidenceIdentity: { pinnedSnapshotHash },
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });
    map.set(L.secOf(iv.intervalStart), {
      trust: v.trustLevel,
      reasons: v.reasonCodes,
      speed: v.trustLevel === 'UNTRUSTED' ? null : v.qcTrustedSpeedKmh,
    });
  }
  return map;
}

function loadTig22() {
  const tripIdentity = JSON.parse(readSpeedInput('tiguan-20261022/snapshots/TRIP_IDENTITY.json').toString('utf8'));
  const ref = L.parseCsv(readSpeedInput('tiguan-20261022/reference/TIGUAN_2026-10-22_1Hz.csv').toString('utf8'));
  const refRows = ref.map((r) => ({ sec: L.secOf(r.time_utc_estimated), ref: L.numOrNull(r.speed_display_kmh), clip: r.source_clip }));
  const refBySec = new Map(refRows.map((r) => [r.sec, r.ref]));
  const text = readSpeedInput('tiguan-20261022/snapshots/di_v0_s4_evidence_container.bin').toString('utf8');
  const parsed = parseDiV0S4EvidenceContainer(text);
  const ad = adaptMotionCoreShadowEvidenceFromParsedContainer(parsed, 'RUPTELA_R1');
  const s1 = buildDiV0S4dS1InputFromParsedContainer(parsed, 'RUPTELA_R1');
  const di = diV0Replay(s1);
  const qcEvidence = buildDiV0TripSpeedQualityEvidenceFromParsedContainer(parsed);
  di.qc = qcReplay(di.intervals, qcEvidence.positions, qcEvidence.r1Obd, parsed.snapshotHash);

  const procC4 = processDiV0MotionCoreShadowTrip({
    parsed,
    sourceFamily: 'RUPTELA_R1',
    pinnedSnapshotHash: parsed.snapshotHash,
    combinedInputIdentity: parsed.combinedInputIdentity,
    computedAt: new Date('2026-10-23T00:00:00Z'),
    c5_1PreferredSpeedEnabled: false,
  });
  const procC51 = processDiV0MotionCoreShadowTrip({
    parsed,
    sourceFamily: 'RUPTELA_R1',
    pinnedSnapshotHash: parsed.snapshotHash,
    combinedInputIdentity: parsed.combinedInputIdentity,
    computedAt: new Date('2026-10-23T00:00:00Z'),
    c5_1PreferredSpeedEnabled: true,
    vehiclePlausibilityClass: 'TIGUAN',
  });

  const c4 = procC51.payload.c4Speeds ?? procC4.payload.speeds;
  const c51 = procC51.payload.speeds;
  const repairs = procC51.payload.speedRepairs ?? [];
  const repairBySec = new Map(repairs.map((r) => [L.secOf(r.bucketLabelUtc), r]));

  const c4By = new Map(c4.map((s) => [L.secOf(s.bucketLabelUtc), s]));
  const c51By = new Map(c51.map((s) => [L.secOf(s.bucketLabelUtc), s]));
  const fsmBy = new Map(procC4.payload.fsmLabels.map((f) => [L.secOf(f.bucketLabelUtc), f]));
  const obd = new Map(ad.sparseSpeed.map((s) => [L.secOf(s.label), s.speedKmh]));
  const gridSecs = [...new Set(ad.buckets.map((b) => L.secOf(b.bucketLabelUtc)))].sort((a, b) => a - b);
  const bucketBy = new Map(ad.buckets.map((b) => [L.secOf(b.bucketLabelUtc), b]));
  const presentSecs = new Set(
    ad.buckets.filter((b) => b.availability === 'PRESENT' && b.latitude != null).map((b) => L.secOf(b.bucketLabelUtc)),
  );
  const posFeat = L.positionFeatures(presentSecs, new Set(gridSecs));

  const eventsC4 = procC4.payload.events;
  const eventsC51 = procC51.payload.events;
  const { classes } = L.classifyReference(refRows);
  const runs = L.zeroRuns(refRows);

  return {
    tripIdentity,
    parsed,
    refRows,
    refBySec,
    gridSecs,
    bucketBy,
    presentSecs,
    posFeat,
    di,
    c4By,
    c51By,
    repairBySec,
    fsmBy,
    obd,
    eventsC4,
    eventsC51,
    procC4,
    procC51,
    classes,
    runs,
  };
}

function activeEventAt(events, sec) {
  for (const e of events) {
    const s = L.secOf(e.startLabel);
    const end = L.secOf(e.endLabel);
    if (sec >= s && sec <= end) return e.kind;
  }
  return '';
}

function videoGtClass(sec, ref) {
  if (sec > VIDEO_GT_LAST_SEC) return 'UNSCORED_VIDEO_GAP';
  if (ref == null) return 'VIDEO_UNREADABLE';
  return 'VIDEO_SCORED';
}

function buildPerSecond(d) {
  const rows = [];
  for (const sec of d.gridSecs) {
    const label = L.labelOf(sec * 1000);
    const ref = d.refBySec.get(sec) ?? null;
    const l3 = d.di.map.get(sec);
    const qc = d.di.qc.get(sec);
    const c4 = d.c4By.get(sec);
    const c51 = d.c51By.get(sec);
    const rep = d.repairBySec.get(sec);
    const fsm = d.fsmBy.get(sec);
    const b = d.bucketBy.get(sec);
    const gt = videoGtClass(sec, ref);
    const refCls = d.classes.get(sec);
    rows.push({
      time_utc: label,
      video_gt_status: gt,
      video_speed_kmh: ref == null ? '' : ref,
      video_ref_class: refCls ? refCls.cls : '',
      l3_speed_kmh: l3?.speed ?? '',
      l3_motion_state: l3?.state ?? '',
      l3_speed_evidence: l3?.speedEvidenceState ?? '',
      l3_qc_trust: qc?.trust ?? '',
      l3_qc_speed_kmh: qc?.speed ?? '',
      l3_qc_reasons: qc?.reasons?.join('|') ?? '',
      c4_speed_kmh: c4?.speedKmh ?? '',
      c4_quality: c4?.quality ?? '',
      c5_1_speed_kmh: c51?.speedKmh ?? '',
      c5_1_quality: c51?.quality ?? '',
      c5_1_repair_state: rep?.repairState ?? '',
      c5_1_q5: rep?.q5Evidence ?? '',
      c5_1_q6: rep?.q6Evidence ?? '',
      position_availability: b?.availability ?? '',
      position_present: d.presentSecs.has(sec) ? 1 : 0,
      position_gap_len_s: d.posFeat.get(sec)?.gapLenS ?? '',
      position_pattern: d.posFeat.get(sec)?.pattern ?? '',
      fsm_state: fsm?.state ?? '',
      fsm_evidence_quality: fsm?.evidenceQuality ?? '',
      fsm_reason: fsm?.reason ?? '',
      obd_speed_kmh_non_authoritative: d.obd.get(sec) ?? '',
      ds4_event_c4: activeEventAt(d.eventsC4, sec),
      ds4_event_c5_1_series: activeEventAt(d.eventsC51, sec),
    });
  }
  return rows;
}

function speedMetricsFor(rows, getEst, scoredOnly = true) {
  const errs = [];
  for (const r of rows) {
    if (scoredOnly && r.video_gt_status !== 'VIDEO_SCORED') continue;
    if (r.video_speed_kmh === '') continue;
    const est = getEst(r);
    if (est === '' || est == null) continue;
    errs.push(Number(est) - Number(r.video_speed_kmh));
  }
  return L.metrics(errs);
}

function motionMetrics(refRows, claimFn) {
  const { classes } = L.classifyReference(refRows);
  const scored = refRows
    .filter((r) => r.ref != null && r.sec <= VIDEO_GT_LAST_SEC)
    .map((r) => ({ sec: r.sec, ref: r.ref, cls: classes.get(r.sec).cls }));
  return L.motionClaimEvaluation(scored, claimFn);
}

function buildAnomalies(d, perSec) {
  const windows = [
    { id: 'W18_41', start: '2026-10-22T18:41:00Z', end: '2026-10-22T18:41:59Z', focus: 'Tiguan movement + video GT', epistemic: 'CONFIRMED' },
    { id: 'W18_49_GPS', start: '2026-10-22T18:49:13Z', end: '2026-10-22T18:49:23Z', focus: 'GPS jump cluster / quarantine', epistemic: 'LIKELY' },
    { id: 'W19_04_UNSCORED', start: '2026-10-22T19:04:34Z', end: '2026-10-22T19:04:52Z', focus: 'Speed spikes / OUTLIER_REJECTED — no video GT', epistemic: 'UNSCORED' },
  ];
  const anomalies = [];
  for (const w of windows) {
    const s0 = L.secOf(w.start);
    const s1 = L.secOf(w.end);
    const slice = perSec.filter((r) => { const s = L.secOf(r.time_utc); return s >= s0 && s <= s1; });
    const scored = slice.filter((r) => r.video_gt_status === 'VIDEO_SCORED');
    const c4Spike = slice.filter((r) => r.c4_quality === 'OUTLIER_REJECTED' || Number(r.c4_speed_kmh) > 120);
    const c51Repair = slice.filter((r) => r.c5_1_repair_state && r.c5_1_repair_state !== 'PASS_THROUGH');
    const fsmMovingWhileRefZero = scored.filter((r) => r.video_speed_kmh === 0 && r.fsm_state === 'MOVING');
    anomalies.push({
      window_id: w.id,
      start_utc: w.start,
      end_utc: w.end,
      epistemic: w.epistemic,
      focus: w.focus,
      seconds_in_window: slice.length,
      video_scored_seconds: scored.length,
      c4_outlier_or_high_speed_seconds: c4Spike.length,
      c5_1_non_passthrough_seconds: c51Repair.length,
      fsm_moving_while_video_zero: fsmMovingWhileRefZero.length,
      primary_cause_hypothesis:
        w.id === 'W19_04_UNSCORED'
          ? 'L3/C4 data gap + leg quarantine (no manoeuvre claims)'
          : w.id === 'W18_49_GPS'
            ? 'GPS source / DIMO aggregation'
            : 'Motion-FSM vs video stillstand',
      evidence_note: slice.slice(0, 3).map((r) => `${r.time_utc}:v=${r.video_speed_kmh},c4=${r.c4_speed_kmh}/${r.c4_quality},fsm=${r.fsm_state}`).join('; '),
      severity_rank: w.id === 'W19_04_UNSCORED' ? 2 : w.id === 'W18_49_GPS' ? 3 : 4,
    });
  }
  anomalies.sort((a, b) => a.severity_rank - b.severity_rank);
  return anomalies;
}

function evaluateEvents(d, events, tag) {
  const drive = {
    id: 'TIG22',
    identity: { vehicleClass: 'TIGUAN', role: 'EVAL', tripId: d.parsed.tripId, limitations: d.procC4.summary.knownLimitations ?? [] },
    refRows: d.refRows,
    buckets: [...d.bucketBy.values()],
    c4: [...d.c4By.entries()].map(([sec, s]) => ({ label: L.labelOf(sec * 1000), valueKmh: s.speedKmh, quality: s.quality })),
    events,
    operatorWindows: null,
  };
  const refBySec = new Map(d.refRows.map((r) => [r.sec, r.ref]));
  const oracle = core.detectMotionManoeuvreEvents(0, E.referenceAsSpeedSamples(d.refRows, 'VIDEO_REFERENCE'), 'VIDEO_REFERENCE', ['OK'], OPTIONS);
  const minDelta = THR.minDeltaKmh;
  const cls = E.classifyEvents(events, oracle, d.refRows, minDelta, { matching: 'v2_gap2s' });
  const ctx = E.boundaryContext(drive.c4, drive.buckets, GUARDS.usableQualities, GUARDS.maxGapS);
  const oracleRows = cls.oracleRows.map((orow) => {
    const o = orow.o;
    const status = E.oracleStatus(orow, ctx.c4BySec, GUARDS.usableQualities);
    const hit = orow.hits[0] ?? null;
    return {
      event_pipeline: tag,
      kind: o.kind,
      start_utc: o.startLabel,
      end_utc: o.endLabel,
      duration_s: o.durationS,
      delta_kmh: o.deltaKmh,
      status,
      borderline: o.peakAccel1sMps2 < THR.entryMps2 + E.EVENT_RULES.borderlineBandMps2 ? 1 : 0,
      ds4_hits: orow.hits.length,
      ds4_delta_kmh: hit ? hit.ev.deltaKmh : '',
      start_offset_s: hit ? hit.s - orow.s : '',
      c4_null_or_unusable_in_window: (() => {
        let n = 0;
        for (let t = orow.s; t <= orow.e; t++) {
          const c = ctx.c4BySec.get(t);
          if (!c || c.valueKmh == null || !GUARDS.usableQualities.includes(c.quality)) n++;
        }
        return n;
      })(),
    };
  });
  const eventRows = cls.ds4.map((r) => ({
    event_pipeline: tag,
    kind: r.ev.kind,
    start_utc: r.ev.startLabel,
    end_utc: r.ev.endLabel,
    delta_kmh: r.ev.deltaKmh,
    cls: r.cls,
    quality: r.ev.quality,
    accepted: E.isAcceptedBaseline(r.ev) ? 1 : 0,
  }));
  return { oracleRows, eventRows, oracleCount: oracle.length };
}

// ---------- run ----------
fs.mkdirSync(outDir, { recursive: true });
const d = loadTig22();
const perSec = buildPerSecond(d);

const perSecCols = Object.keys(perSec[0]);
fs.writeFileSync(path.join(outDir, 'per_second.csv'), L.toCsv(perSec, perSecCols));

const get = (r, field) => (r[field] === '' ? null : Number(r[field]));
const speed = {
  l3: speedMetricsFor(perSec, (r) => r.l3_speed_kmh),
  l3_qc: speedMetricsFor(perSec, (r) => r.l3_qc_speed_kmh),
  c4: speedMetricsFor(perSec, (r) => r.c4_speed_kmh),
  c5_1: speedMetricsFor(perSec, (r) => r.c5_1_speed_kmh),
  common_scored: {
    l3: speedMetricsFor(perSec, (r) => r.l3_speed_kmh),
    c4: speedMetricsFor(perSec, (r) => r.c4_speed_kmh),
    c5_1: speedMetricsFor(perSec, (r) => r.c5_1_speed_kmh),
  },
};
const sensitivity = {};
for (const shift of [-2, -1, 0, 1, 2]) {
  const refRows = d.refRows;
  const c4By = d.c4By;
  const l3map = d.di.map;
  const errsC4 = [];
  const errsL3 = [];
  for (const r of refRows) {
    if (r.ref == null || r.sec > VIDEO_GT_LAST_SEC) continue;
    const c4 = c4By.get(r.sec + shift);
    const l3 = l3map.get(r.sec + shift);
    if (c4?.speedKmh != null) errsC4.push(c4.speedKmh - r.ref);
    if (l3?.speed != null) errsL3.push(l3.speed - r.ref);
  }
  sensitivity[`shift_${shift}s`] = { c4: L.metrics(errsC4), l3: L.metrics(errsL3) };
}

const motionFsm = motionMetrics(d.refRows, (sec) => L.fsmClaim(d.fsmBy.get(sec)?.state ?? null));
const motionL3 = motionMetrics(d.refRows, (sec) => {
  const x = d.di.map.get(sec);
  return x ? L.l3Claim(x.speed, x.state) : 'NONE';
});
const timingFsm = L.timingOffsets(d.runs, d.refBySec, (sec) => L.fsmClaim(d.fsmBy.get(sec)?.state ?? null), (sec) => d.gridSecs.includes(sec));

const evC4 = evaluateEvents(d, d.eventsC4, 'C4_EVENT_SERIES');
const evC51 = evaluateEvents(d, d.eventsC51, 'C5_1_EVENT_SERIES');
const eventsComparison = [...evC4.oracleRows, ...evC51.oracleRows];
const eventsComparisonCols = Object.keys(eventsComparison[0] ?? { event_pipeline: '' });
fs.writeFileSync(path.join(outDir, 'events_comparison.csv'), L.toCsv(eventsComparison, eventsComparisonCols));

const anomalies = buildAnomalies(d, perSec);
fs.writeFileSync(path.join(outDir, 'anomalies.csv'), L.toCsv(anomalies, Object.keys(anomalies[0])));

const videoScored = perSec.filter((r) => r.video_gt_status === 'VIDEO_SCORED').length;
const videoReadable = d.refRows.filter((r) => r.ref != null && r.sec <= VIDEO_GT_LAST_SEC).length;

const metrics = {
  schema: 'DS4_TIG22_DEEP_VALIDATION_V1',
  generatedAtUtc: new Date().toISOString(),
  tripId: d.parsed.tripId,
  vehicle: d.tripIdentity.vehicle,
  codePins: {
    primaryProductionSha: PROD_SHA,
    replayCodeRootSha: codeSha,
    originMainAtRun: mainSha,
    c4: core.MOTION_CORE_SPEED_C4_VERSION,
    c5_1: core.MOTION_CORE_SPEED_C5_1_VERSION,
    c5_1_safety: core.MOTION_CORE_SPEED_C5_1_PRODUCTION_SAFETY_VERSION,
    c5_1_algo_file_sha256: core.motionCoreSpeedC5_1AlgorithmFileSha256(),
    fsm: core.motionFsmVersionId(core.MOTION_FSM_V0_3_CANDIDATE_OPTIONS),
    events: core.motionEventVersionId(OPTIONS),
    speedQcPolicy: DI_V0_SPEED_QC_POLICY_V2,
  },
  provenance: {
    speedEvalPackage: 'ds4-speed-video-reference-20261023 (PR #2136)',
    accelEvalRules: 'ds4-accel-brake-video-reference-20261023 EVALUATION_RULES + v2_gap2s (PR #2139)',
    videoGtLastUtc: VIDEO_GT_LAST_UTC,
    primaryTimeMatchingShiftS: 0,
  },
  coverage: {
    tripGridSeconds: perSec.length,
    videoGtScoredSeconds: videoScored,
    videoReadableRowsInGtWindow: videoReadable,
    videoGtShareOfGrid: L.round(videoScored / perSec.length, 4),
    positionPresentSeconds: d.presentSecs.size,
  },
  speed,
  sensitivity,
  motion: { fsm_vs_video: motionFsm, l3_claim_vs_video: motionL3, fsm_stop_start_timing: timingFsm },
  events: {
    c4: { oracleManoeuvres: evC4.oracleCount, oracleStatus: evC4.oracleRows.reduce((m, r) => { m[r.status] = (m[r.status] ?? 0) + 1; return m; }, {}) },
    c5_1: { oracleManoeuvres: evC51.oracleCount, oracleStatus: evC51.oracleRows.reduce((m, r) => { m[r.status] = (m[r.status] ?? 0) + 1; return m; }, {}) },
    fsmUsesC4Only: true,
    note: 'Production FSM is wired to C4 series; C5.1 affects event detector only when enabled in shadow processor.',
  },
  c5_1_repair_counts: perSec.reduce((m, r) => {
    const k = r.c5_1_repair_state || 'NONE';
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {}),
};

fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));

const inputFiles = [
  path.join(speedEvalRoot, 'inputs/tiguan-20261022/snapshots/di_v0_s4_evidence_container.bin'),
  path.join(speedEvalRoot, 'inputs/tiguan-20261022/reference/TIGUAN_2026-10-22_1Hz.csv'),
  path.join(speedEvalRoot, 'inputs/tiguan-20261022/snapshots/TRIP_IDENTITY.json'),
  path.join(evalRoot, 'inputs/tiguan-prod-shadow-v4/di_v0_motion_core_shadow_payload.json'),
];
const manifest = {
  schema: 'DS4_TIG22_DEEP_VALIDATION_INPUT_MANIFEST_V1',
  tripId: d.parsed.tripId,
  generatedAtUtc: metrics.generatedAtUtc,
  codeSha,
  inputs: inputFiles.map((f) => ({ path: path.relative(repoRoot, f), sha256: sha256File(f), bytes: fs.statSync(f).size })),
  references: {
    pr2136: 'ds4-speed-video-reference-20261023',
    pr2139: 'event_eval_lib.cjs (v2_gap2s) vendored under scripts/',
    pr2147: 'DS4 research archive index on main (when present)',
    productionIntegration: 'PR #2145/#2146 @ 716f93fed',
  },
};
fs.writeFileSync(path.join(evalRoot, 'INPUT_MANIFEST.json'), JSON.stringify(manifest, null, 2));

console.log(JSON.stringify({ ok: true, outDir, tripId: d.parsed.tripId, videoScored, metrics: { speed: metrics.speed } }, null, 2));
