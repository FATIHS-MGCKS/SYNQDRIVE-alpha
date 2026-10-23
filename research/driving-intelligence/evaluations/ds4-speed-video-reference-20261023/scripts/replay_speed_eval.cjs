#!/usr/bin/env node
'use strict';
/**
 * Offline replay of the DS4 speed paths (DI V0 L3, Motion Core C4 + FSM) against the sealed video
 * reference tables. No provider, DB or production access; no runtime change.
 *
 *   node scripts/replay_speed_eval.cjs [--code-root <repo-checkout>] [--tag <label>] [--expect-sha <sha>]
 *     [--strip-obd-speed-influence]
 *
 * --code-root selects which checkout's DI code is replayed (default: this repository). The DI directory of
 * that checkout must be clean; its HEAD SHA is recorded in every output.
 *
 * --strip-obd-speed-influence: offline candidate — R1 OBD vehicle speed is not passed into DI-V0 compute,
 * speed-QC, or motion-FSM sparse input. The pinned OBD samples remain in outputs as obd_kmh (comparison only).
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const L = require('./eval_lib.cjs');

const evalRoot = path.resolve(__dirname, '..');
const thisRepo = path.resolve(evalRoot, '../../../..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const codeRoot = path.resolve(opt('--code-root', thisRepo));
const tag = opt('--tag', 'main');
const expectSha = opt('--expect-sha', null);
const stripObdSpeedInfluence = args.includes('--strip-obd-speed-influence');
const DI = 'backend/src/modules/vehicle-intelligence/driving-intelligence';
const outDir = path.join(evalRoot, 'outputs', tag);
fs.mkdirSync(outDir, { recursive: true });

const codeSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: codeRoot }).toString().trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--', DI], { cwd: codeRoot }).toString().trim();
if (dirty) throw new Error(`DI directory in ${codeRoot} is not clean:\n${dirty}`);
if (expectSha && codeSha !== expectSha) throw new Error(`code-root HEAD ${codeSha} != expected ${expectSha}`);

require(path.join(codeRoot, 'backend/node_modules/ts-node')).register({
  transpileOnly: true,
  project: path.join(codeRoot, 'backend/tsconfig.json'),
});
const req = (rel) => require(path.join(codeRoot, DI, rel));
const { parseDiV0S4EvidenceContainer } = req('s4a-foundation/di-v0-s4a-evidence-container-parse.ts');
const { processDiV0MotionCoreShadowTrip } = req('motion-core-shadow-worker/di-v0-motion-core-shadow-processor.ts');
const { adaptMotionCoreShadowEvidenceFromParsedContainer } = req('motion-core-shadow-worker/di-v0-motion-core-shadow-evidence.adapter.ts');
const { buildDiV0S4dS1InputFromParsedContainer } = req('s4d-replay/di-v0-s4d-replay-s1.ts');
const { parseDiV0PositionSnapshot, diV0PositionSnapshotToS1Observations } = req('position-acquisition/di-v0-position-snapshot-parse.ts');
const { buildDiV0TripSpeedQualityEvidenceFromParsedContainer } = req('trip-speed-quality/di-v0-trip-speed-quality-evidence.ts');
const { evaluateDiV0SpeedQcInterval } = req('speed-qc/evaluate-di-v0-speed-qc-interval.ts');
const { DI_V0_SPEED_QC_POLICY_V2 } = req('speed-qc/di-v0-speed-qc-policy.version.ts');
const { classifyPositionRows } = req('core/position/hold-release.ts');
const core = req('core/index.ts');

// Physically implausible estimate threshold for the *separate* exclusion view (rules §11 Nachtrag 2).
// It never replaces the primary metrics; it only names which seconds carry such values.
const IMPLAUSIBLE_KMH = 250;

const versions = {
  tag, codeRoot, codeSha,
  obdSpeedInfluence: stripObdSpeedInfluence ? 'STRIPPED_OFFLINE_CANDIDATE' : 'BASELINE_PINNED_AS_DEPLOYED',
  c4: core.MOTION_CORE_SPEED_C4_VERSION,
  legConsistency: core.MOTION_CORE_LEG_CONSISTENCY_VERSION ?? null,
  fsm: core.motionFsmVersionId(core.MOTION_FSM_V0_3_CANDIDATE_OPTIONS),
  events: core.motionEventVersionId(core.MOTION_EVENT_V0_2_CANDIDATE_OPTIONS),
  frozenL3Replay: core.MOTION_CORE_FROZEN_L3_REPLAY_VERSION,
  diV0: core.DEFAULT_DI_V0_VERSION_TUPLE,
  calibration: core.CALIBRATION_UNSET_V0_BUNDLE.calibrationVersion,
  c4InputHorizonForwardS: core.MOTION_CORE_C4_INPUT_HORIZON_FORWARD_S,
  speedQcPolicy: DI_V0_SPEED_QC_POLICY_V2,
  implausibleViewThresholdKmh: IMPLAUSIBLE_KMH,
};

const inputs = path.join(evalRoot, 'inputs');
const inputManifest = [];
const readInput = (rel) => {
  const file = path.join(rel.startsWith('/') ? '' : inputs, rel);
  inputManifest.push({ file: path.relative(thisRepo, file), sha256: L.sha256File(file), bytes: fs.statSync(file).size });
  return fs.readFileSync(file);
};

// ---------- DI V0 full interval replay (L3 + motion state), production calibration ----------
function diV0Replay(s1Input) {
  const out = core.computeDiV0TripIntervals(s1Input, {
    versions: core.DEFAULT_DI_V0_VERSION_TUPLE,
    calibration: core.CALIBRATION_UNSET_V0_BUNDLE,
  });
  const map = new Map();
  for (const iv of out.intervals) {
    map.set(L.secOf(iv.intervalStart), { speed: iv.estimatedSpeedKmh, state: iv.motionState, positionState: iv.positionState, abstention: iv.abstentionReason });
  }
  return { map, warnings: out.warnings, intervals: out.intervals };
}

// Production speed-QC (trip-speed-quality product read uses DI_V0_SPEED_QC_POLICY_V2) applied to the replayed
// DI V0 intervals. This is the gate the product-facing speed passes through; raw L3 (shadow) is evaluated separately.
function qcReplay(intervals, positions, r1Obd, pinnedSnapshotHash) {
  const map = new Map();
  for (const iv of intervals) {
    const centerBucketLabel = L.labelOf(Date.parse(iv.referenceTime));
    const v = evaluateDiV0SpeedQcInterval({
      centerBucketLabel,
      shadow: {
        intervalStart: iv.intervalStart, intervalEnd: iv.intervalEnd, referenceTime: iv.referenceTime,
        estimatedSpeedKmh: iv.estimatedSpeedKmh, speedEvidenceState: iv.speedEvidenceState, valueConfidence: iv.valueConfidence,
        sourceRelation: iv.sourceRelation, motionState: iv.motionState, positionState: iv.positionState,
        abstentionReason: iv.abstentionReason, sourceQualityFlags: iv.sourceQualityFlags, evidenceSources: iv.evidenceSources,
      },
      positions, r1Obd, evidenceIdentity: { pinnedSnapshotHash }, qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });
    map.set(L.secOf(iv.intervalStart), { trust: v.trustLevel, reasons: v.reasonCodes, speed: v.trustLevel === 'UNTRUSTED' ? null : v.qcTrustedSpeedKmh });
  }
  return map;
}

function motionCoreReplay(buckets, sparse) {
  const c4 = core.computeC4AdaptiveL3(buckets);
  const fsm = core.runMotionFsm(buckets, c4, 'RETROSPECTIVE', sparse, core.MOTION_FSM_PARAMS_V0_2_DEV, core.MOTION_FSM_V0_3_CANDIDATE_OPTIONS);
  const events = core.detectMotionManoeuvreEvents(0, c4, 'C4_ADAPTIVE_L3', core.MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities, core.MOTION_EVENT_V0_2_CANDIDATE_OPTIONS);
  const stops = core.extractMotionFsmStopEpisodes(0, fsm, 'RETROSPECTIVE');
  return { c4, fsm, events, stops };
}

// ---------- drive loaders ----------
function loadContainerDrive(id, text, family, refRows, stored) {
  const parsed = parseDiV0S4EvidenceContainer(text);
  const ad = adaptMotionCoreShadowEvidenceFromParsedContainer(parsed, family);
  const s1Full = buildDiV0S4dS1InputFromParsedContainer(parsed, family);
  const s1ForDi = stripObdSpeedInfluence ? { ...s1Full, r1Obd: [] } : s1Full;
  const c4 = core.computeC4AdaptiveL3(ad.buckets);
  let mc;
  let processorPayload = null;
  if (stripObdSpeedInfluence) {
    // C4 is GPS-only; FSM without sparse OBD (no directMoving/directZero from R1).
    mc = motionCoreReplay(ad.buckets, null);
    if (JSON.stringify(mc.c4.map((s) => [s.label, s.valueKmh, s.quality])) !== JSON.stringify(c4.map((s) => [s.label, s.valueKmh, s.quality]))) {
      throw new Error('C4 parity broken in strip-obd mode');
    }
    mc.c4 = c4;
  } else {
    const proc = processDiV0MotionCoreShadowTrip({ parsed, sourceFamily: family, pinnedSnapshotHash: parsed.snapshotHash, combinedInputIdentity: parsed.combinedInputIdentity, computedAt: new Date('2026-10-23T00:00:00Z') });
    processorPayload = proc.payload;
    if (JSON.stringify(c4.map((s) => [s.label, s.valueKmh, s.quality])) !== JSON.stringify(proc.payload.speeds.map((s) => [s.bucketLabelUtc, s.speedKmh, s.quality]))) throw new Error('C4 parity with processor broken');
    mc = {
      c4,
      fsm: proc.payload.fsmLabels.map((f) => ({ label: f.bucketLabelUtc, state: f.state, evidenceQuality: f.evidenceQuality, reason: f.reason })),
      events: proc.payload.events,
      stops: proc.payload.stopEpisodes,
    };
  }
  const di = diV0Replay(s1ForDi);
  const qcEvidence = buildDiV0TripSpeedQualityEvidenceFromParsedContainer(parsed);
  const r1ForQc = stripObdSpeedInfluence ? [] : qcEvidence.r1Obd;
  di.qc = qcReplay(di.intervals, qcEvidence.positions, r1ForQc, parsed.snapshotHash);
  const obd = new Map(ad.sparseSpeed.map((s) => [L.secOf(s.label), s.speedKmh]));
  const limitations = [...ad.limitations];
  if (stripObdSpeedInfluence) limitations.push('OFFLINE_CANDIDATE_STRIP_OBD_SPEED_INFLUENCE');
  return buildDrive(id, { tripId: parsed.tripId, snapshotHash: parsed.snapshotHash, sourceFamily: family, sparseComparable: ad.sparseComparable, limitations }, ad.buckets, mc, di, obd, refRows, stored, processorPayload);
}

function buildDrive(id, identity, buckets, mc, di, obd, refRows, stored, processorPayload) {
  const gridSecs = new Set(buckets.map((b) => L.secOf(b.bucketLabelUtc)));
  const presentSecs = new Set(buckets.filter((b) => b.availability === 'PRESENT' && b.latitude != null).map((b) => L.secOf(b.bucketLabelUtc)));
  const posFeat = L.positionFeatures(presentSecs, gridSecs);
  const c4By = new Map(mc.c4.map((s) => [L.secOf(s.label), s]));
  const fsmBy = new Map(mc.fsm.map((f) => [L.secOf(f.label), f]));
  const refBySec = new Map(refRows.map((r) => [r.sec, r.ref]));
  const { classes, runs } = L.classifyReference(refRows);
  const rows = refRows.map((r) => ({ ...r, cls: classes.get(r.sec).cls, phase: L.phaseOf(refBySec, r.sec) }));
  return { id, identity, buckets, gridSecs, presentSecs, posFeat, mc, c4By, fsmBy, di, obd, rows, refBySec, runs, stored, processorPayload };
}

function tiguan() {
  const ref = L.parseCsv(readInput('tiguan-20261022/reference/TIGUAN_2026-10-22_1Hz.csv').toString('utf8'));
  const refRows = ref.map((r) => ({ sec: L.secOf(r.time_utc_estimated), ref: L.numOrNull(r.speed_display_kmh), clip: r.source_clip }));
  if (new Set(refRows.map((r) => r.sec)).size !== refRows.length) throw new Error('duplicate reference seconds');
  const storedL3 = new Map();
  for (const r of L.parseCsv(readInput('tiguan-20261022/snapshots/di_v0_shadow_intervals.csv').toString('utf8'))) {
    storedL3.set(L.secOf(r.reference_time.replace(' ', 'T') + 'Z'), { speed: L.numOrNull(r.estimated_speed_kmh), state: r.motion_state, positionState: r.position_state });
  }
  const payload = JSON.parse(readInput('tiguan-20261022/snapshots/di_v0_motion_core_shadow_payload.json').toString('utf8'));
  const storedC4 = new Map(payload.speeds.map((s) => [L.secOf(s.bucketLabelUtc), { speed: s.speedKmh, quality: s.quality }]));
  const storedFsm = new Map(payload.fsmLabels.map((f) => [L.secOf(f.bucketLabelUtc), f.state]));
  const runMeta = JSON.parse(readInput('tiguan-20261022/snapshots/di_v0_motion_core_shadow_run_meta.json').toString('utf8'));
  const shadowRun = JSON.parse(readInput('tiguan-20261022/snapshots/di_v0_shadow_run.json').toString('utf8'));
  readInput('tiguan-20261022/reference/manifest.json');
  readInput('tiguan-20261022/PROVENANCE_MANIFEST.json');
  const text = readInput('tiguan-20261022/snapshots/di_v0_s4_evidence_container.bin').toString('utf8');
  return loadContainerDrive('TIG22', text, 'RUPTELA_R1', refRows, { l3: storedL3, c4: storedC4, fsm: storedFsm, events: payload.events, stopEpisodes: payload.stopEpisodes, versions: payload.contract.algorithmVersions, runMeta, shadowRun });
}

function tesla21(key, tripNo) {
  const joined = L.parseCsv(readInput('tesla-20261021/JOINED_REFERENCE_TABLE.csv').toString('utf8'));
  const rowsForTrip = joined.filter((r) => r.trip === String(tripNo));
  const seen = new Set();
  const refRows = [];
  for (const r of rowsForTrip) {
    const sec = L.secOf(r.bucket_label_utc);
    if (seen.has(sec)) continue; // protocol: KEEP_FIRST_BY_SAMPLE_ID_ORDER
    seen.add(sec);
    const readable = r.inclusion_flag === 'INCLUDE' && r.speed_status === 'VISIBLE_DISPLAY_VALUE';
    refRows.push({ sec, ref: readable ? L.numOrNull(r.tesla_speed_kmh_primary) : null, clip: r.clip, joinedShadowL3: L.numOrNull(r.shadow_estimated_speed_kmh), joinedShadowState: r.shadow_motion_state });
  }
  refRows.sort((a, b) => a.sec - b.sec);
  const storedL3 = new Map();
  for (const line of readInput(`tesla-20261021/shadow/${key}_shadow_intervals.jsonl`).toString('utf8').trim().split('\n')) {
    const iv = JSON.parse(line);
    storedL3.set(L.secOf(iv.intervalStart), { speed: iv.estimatedSpeedKmh, state: iv.motionState, positionState: iv.positionState });
  }
  const text = zlib.gunzipSync(readInput(`tesla-20261021/s4_evidence/${key}_evidence_payload.gz`)).toString('utf8');
  return loadContainerDrive(`TES21-${tripNo}`, text, 'API_SYNTHETIC', refRows, { l3: storedL3, c4: null, fsm: null, events: null });
}

function tesla16() {
  const fx = path.join(thisRepo, 'architecture/drivingintelligence/evidence/ldi-10d/fixtures/tesla-20261016');
  const refJson = JSON.parse(readInput(path.join(fx, 'VIDEO_TACHO_REFERENCE.json')).toString('utf8'));
  const grid = JSON.parse(readInput(path.join(fx, 'TESLA_POSITION_GRID.json')).toString('utf8'));
  const snapshotText = readInput(path.join(fx, 'POSITION_CHANNEL_SNAPSHOT_V0_1.txt')).toString('utf8');
  const refRows = refJson.rows.map((r) => ({ sec: L.secOf(r.bucketLabelUtc), ref: r.tachoKmh == null ? null : Number(r.tachoKmh), clip: r.videoFile }));
  const buckets = grid.buckets.map((b) => ({ bucketLabelUtc: b.bucketLabelUtc, availability: b.availability, latitude: b.latitude, longitude: b.longitude }));
  const storedL3 = new Map(grid.buckets.map((b) => [L.secOf(b.bucketLabelUtc), { speed: b.pinnedProductionL3Kmh, state: null, positionState: b.positionState, qcTrustLevel: b.qcTrustLevel }]));
  const material = parseDiV0PositionSnapshot(snapshotText);
  const positions = diV0PositionSnapshotToS1Observations(material);
  const di = diV0Replay({ sourceFamily: 'API_SYNTHETIC', positions, r1Obd: [], nativeEvents: [] }); // fixture has no R1_OBD
  // same per-bucket position/hold-release classification as buildDiV0TripSpeedQualityEvidenceFromParsedContainer
  const qcPositions = classifyPositionRows(material.buckets.map((b) => b.observation), core.CALIBRATION_UNSET_V0_BUNDLE)
    .map((row) => ({ bucketLabel: row.observation.bucketLabel, availability: row.observation.availability, latitude: row.observation.latitude, longitude: row.observation.longitude, positionState: row.positionState }));
  di.qc = qcReplay(di.intervals, qcPositions, [], grid.pinnedSnapshotHash);
  const mc = motionCoreReplay(buckets, null);
  return buildDrive('TES16', { tripId: grid.tripId, snapshotHash: grid.pinnedSnapshotHash, sourceFamily: 'API_SYNTHETIC', sparseComparable: false, limitations: ['NO_R1_OBD_CHANNEL', 'DI_V0_REPLAY_FROM_POSITION_SNAPSHOT_FIXTURE'] }, buckets, mc, di, new Map(), refRows, { l3: storedL3, c4: null, fsm: null, events: null }, null);
}

// ---------- evaluation per drive ----------
function evaluateDrive(d) {
  const gridHas = (sec) => d.gridSecs.has(sec);
  const series = {
    replay_l3: (sec) => d.di.map.get(sec)?.speed ?? null,
    replay_l3_qc: (sec) => d.di.qc.get(sec)?.speed ?? null,
    replay_c4: (sec) => d.c4By.get(sec)?.valueKmh ?? null,
    stored_l3: (sec) => d.stored.l3?.get(sec)?.speed ?? null,
  };
  if (d.stored.c4) series.stored_c4 = (sec) => d.stored.c4.get(sec)?.speed ?? null;
  if (d.obd.size) series.obd = (sec) => d.obd.get(sec) ?? null;
  const claims = {
    replay_l3: (sec) => { const x = d.di.map.get(sec); return x ? L.l3Claim(x.speed, x.state) : 'NONE'; },
    replay_c4: (sec) => L.c4Claim(d.c4By.get(sec)?.valueKmh ?? null),
    replay_fsm: (sec) => L.fsmClaim(d.fsmBy.get(sec)?.state ?? null),
    stored_l3: (sec) => { const x = d.stored.l3?.get(sec); return x ? L.l3Claim(x.speed, x.state) : 'NONE'; },
  };
  if (d.stored.c4) claims.stored_c4 = (sec) => L.c4Claim(d.stored.c4.get(sec)?.speed ?? null);
  if (d.stored.fsm) claims.stored_fsm = (sec) => L.fsmClaim(d.stored.fsm.get(sec) ?? null);
  if (d.obd.size) claims.obd = (sec) => L.c4Claim(d.obd.get(sec) ?? null);

  const speed = Object.fromEntries(Object.entries(series).map(([k, get]) => [k, L.speedEvaluation(d.rows, get, gridHas)]));
  const motion = Object.fromEntries(Object.entries(claims).map(([k, c]) => [k, L.motionClaimEvaluation(d.rows, c)]));
  const timing = Object.fromEntries(Object.entries(claims).map(([k, c]) => [k, L.timingOffsets(d.runs, d.refBySec, c, gridHas)]));

  const pairs = [['replay_l3', 'replay_c4'], ['stored_l3', 'replay_l3'], ['replay_c4', 'obd'], ['replay_l3', 'obd'], ['stored_c4', 'replay_c4'], ['replay_l3', 'replay_l3_qc'], ['replay_l3_qc', 'replay_c4']];
  const common = {};
  for (const [a, b] of pairs) if (series[a] && series[b]) common[`${a}__vs__${b}`] = L.commonSupport(d.rows, series[a], series[b]);

  // production speed-QC digest on the replayed L3 intervals (readable reference seconds in grid)
  const qc = { policy: DI_V0_SPEED_QC_POLICY_V2, trustLevels: {}, reasonCodes: {}, untrustedWithNumericL3: 0, numericL3PassedQc: 0 };
  for (const r of d.rows) {
    if (r.ref == null || !gridHas(r.sec)) continue;
    const v = d.di.qc.get(r.sec);
    if (!v) continue;
    qc.trustLevels[v.trust] = (qc.trustLevels[v.trust] ?? 0) + 1;
    for (const c of v.reasons) qc.reasonCodes[c] = (qc.reasonCodes[c] ?? 0) + 1;
    const raw = series.replay_l3(r.sec);
    if (raw != null) { if (v.trust === 'UNTRUSTED') qc.untrustedWithNumericL3++; else qc.numericL3PassedQc++; }
  }

  // separate exclusion view: physically implausible estimates (> IMPLAUSIBLE_KMH). Never replaces primary metrics.
  const implausible = { thresholdKmh: IMPLAUSIBLE_KMH };
  for (const name of Object.keys(series)) {
    const hits = [];
    const errsExcl = [];
    for (const r of d.rows) {
      if (r.ref == null || !gridHas(r.sec)) continue;
      const v = series[name](r.sec);
      if (v == null) continue;
      if (v > IMPLAUSIBLE_KMH) hits.push({ label: L.labelOf(r.sec * 1000), value: L.round(v, 1), ref: r.ref, qc: name === 'replay_l3' ? d.di.qc.get(r.sec)?.trust ?? null : undefined, qcReasons: name === 'replay_l3' ? d.di.qc.get(r.sec)?.reasons ?? null : undefined });
      else errsExcl.push(v - r.ref);
    }
    implausible[name] = { count: hits.length, hits, metricsExcludingImplausible: hits.length ? L.metrics(errsExcl) : null };
  }

  // sensitivity: shift the DS4 lookup by k seconds (reference unchanged)
  const sensitivity = {};
  for (const k of [...L.RULES.sensitivityShiftsS, 0]) {
    sensitivity[`shift_${k}`] = Object.fromEntries(['replay_l3', 'replay_c4'].map((name) => [name, L.speedEvaluation(d.rows, (sec) => series[name](sec + k), (sec) => gridHas(sec + k)).all]));
  }

  // stored vs replay drift (same path, different point in time)
  const drift = {};
  const driftPairs = [['l3', (sec) => d.stored.l3?.get(sec)?.speed ?? null, series.replay_l3]];
  if (d.stored.c4) driftPairs.push(['c4', series.stored_c4, series.replay_c4]);
  for (const [name, s, r] of driftPairs) {
    let both = 0, equal = 0, storedOnly = 0, replayOnly = 0, maxDiff = 0; const examples = [];
    for (const sec of d.gridSecs) {
      const a = s(sec), b = r(sec);
      if (a == null && b == null) continue;
      if (a != null && b != null) { both++; const diff = Math.abs(a - b); if (diff <= 0.05) equal++; else { maxDiff = Math.max(maxDiff, diff); if (examples.length < 5) examples.push({ label: L.labelOf(sec * 1000), stored: a, replay: b }); } }
      else if (a != null) { storedOnly++; if (examples.length < 5) examples.push({ label: L.labelOf(sec * 1000), stored: a, replay: null }); }
      else { replayOnly++; if (examples.length < 5) examples.push({ label: L.labelOf(sec * 1000), stored: null, replay: b }); }
    }
    drift[name] = { bothNumeric: both, equalWithin005: equal, valueDiffers: both - equal, storedOnly, replayOnly, maxAbsDiffKmh: L.round(maxDiff), examples };
  }

  // sparse-position analysis on replay C4 and replay L3 paired seconds
  const sparse = {};
  for (const name of ['replay_c4', 'replay_l3']) {
    const items = [];
    for (const r of d.rows) {
      if (r.ref == null || !gridHas(r.sec)) continue;
      const v = series[name](r.sec);
      if (v == null) continue;
      const f = d.posFeat.get(r.sec);
      const c4 = d.c4By.get(r.sec);
      items.push({ err: v - r.ref, f, quality: c4?.quality ?? null, flags: c4?.flags ?? [], span: c4?.supportSpanS ?? null });
    }
    sparse[name] = {
      byPattern: L.groupAbsErrors(items, (it) => it.f.pattern),
      byNearestDist: L.groupAbsErrors(items, (it) => L.distClass(it.f.nearestDistS)),
      byC4Quality: name === 'replay_c4' ? L.groupAbsErrors(items, (it) => it.quality) : undefined,
      byC4Flag: name === 'replay_c4' ? L.groupAbsErrors(items.flatMap((it) => (it.flags.length ? it.flags : ['(none)']).map((fl) => ({ err: it.err, fl }))), (it) => it.fl) : undefined,
      bySupportSpan: name === 'replay_c4' ? L.groupAbsErrors(items, (it) => (it.span == null ? 'null' : `span_${it.span}`)) : undefined,
    };
  }
  // evidence class on confirmed-still seconds: is a position row present?
  const stillEvidence = { withPosition: 0, withoutPosition: 0, withoutPositionLabels: [] };
  for (const r of d.rows) if (r.cls === 'STILL_CORE' && gridHas(r.sec)) { if (d.presentSecs.has(r.sec)) stillEvidence.withPosition++; else { stillEvidence.withoutPosition++; if (stillEvidence.withoutPositionLabels.length < 20) stillEvidence.withoutPositionLabels.push(L.labelOf(r.sec * 1000)); } }

  // largest errors (replay C4) for cause analysis
  const worst = d.rows.filter((r) => r.ref != null && series.replay_c4(r.sec) != null).map((r) => ({ label: L.labelOf(r.sec * 1000), ref: r.ref, c4: series.replay_c4(r.sec), l3: series.replay_l3(r.sec), obd: series.obd ? series.obd(r.sec) : null, err: L.round(series.replay_c4(r.sec) - r.ref, 1), quality: d.c4By.get(r.sec)?.quality, flags: d.c4By.get(r.sec)?.flags, pattern: d.posFeat.get(r.sec).pattern, cls: r.cls, phase: r.phase })).sort((a, b) => Math.abs(b.err) - Math.abs(a.err)).slice(0, 40);

  // events: parity counters only, plus legacy-sign check (rules §8)
  const eventSign = (events) => {
    const out = { count: events.length, deltaNonNegative: 0, deltaEqualsKindSignedDiff: 0, mismatches: [] };
    for (const e of events) {
      const sign = e.kind === 'ACCELERATION' ? 1 : -1;
      const expected = Math.round(sign * (e.endSpeedKmh - e.startSpeedKmh) * 10) / 10;
      if (e.deltaKmh >= 0) out.deltaNonNegative++;
      if (Math.abs(expected - e.deltaKmh) <= 0.11) out.deltaEqualsKindSignedDiff++; else out.mismatches.push({ kind: e.kind, start: e.startLabel, delta: e.deltaKmh, expected });
    }
    return out;
  };
  const events = { replay: eventSign(d.mc.events), stored: d.stored.events ? eventSign(d.stored.events) : null, replayKeys: d.mc.events.map((e) => `${e.kind}|${e.startLabel}|${e.endLabel}`) };

  const coverage = {
    gridLabels: d.gridSecs.size, positionPresent: d.presentSecs.size,
    referenceRows: d.rows.length, referenceReadable: d.rows.filter((r) => r.ref != null).length,
    referenceClasses: Object.fromEntries(['STILL_CORE', 'STILL_EDGE', 'MOVING_CONFIRMED', 'SLOW_OR_AMBIGUOUS', 'UNREADABLE'].map((c) => [c, d.rows.filter((r) => r.cls === c).length])),
    zeroRuns: d.runs.length, zeroRunsMin3s: d.runs.filter((r) => r.lengthS >= 3).length,
    referenceWindowUtc: [L.labelOf(d.rows[0].sec * 1000), L.labelOf(d.rows[d.rows.length - 1].sec * 1000)],
    gridWindowUtc: [L.labelOf(Math.min(...d.gridSecs) * 1000), L.labelOf(Math.max(...d.gridSecs) * 1000)],
    diV0Warnings: d.di.warnings,
    replayNumeric: { l3: [...d.di.map.values()].filter((x) => x.speed != null).length, c4: d.mc.c4.filter((s) => s.valueKmh != null).length },
    storedNumeric: { l3: d.stored.l3 ? [...d.stored.l3.values()].filter((x) => x.speed != null).length : null, c4: d.stored.c4 ? [...d.stored.c4.values()].filter((x) => x.speed != null).length : null },
    fsmStates: { replay: countBy(d.mc.fsm.map((f) => f.state)), stored: d.stored.fsm ? countBy([...d.stored.fsm.values()]) : null },
    stopEpisodes: { replay: d.mc.stops.length, stored: d.stored.stopEpisodes ? d.stored.stopEpisodes.length : null },
    events: { replay: d.mc.events.length, stored: d.stored.events ? d.stored.events.length : null },
  };

  // per-second comparison table
  const table = d.rows.map((r) => {
    const f = d.posFeat.get(r.sec) ?? {};
    const c4 = d.c4By.get(r.sec);
    const l3 = d.di.map.get(r.sec);
    const sl3 = d.stored.l3?.get(r.sec);
    return {
      label_utc: L.labelOf(r.sec * 1000), clip: r.clip ?? '', ref_kmh: r.ref, ref_class: r.cls, ref_phase: r.phase ?? '',
      in_grid: gridHas(r.sec) ? 1 : 0, pos_pattern: f.pattern ?? '', pos_nearest_s: f.nearestDistS ?? '', pos_gap_len_s: f.gapLenS ?? '',
      stored_l3_kmh: sl3?.speed ?? '', stored_l3_state: sl3?.state ?? '', replay_l3_kmh: l3?.speed ?? '', replay_l3_state: l3?.state ?? '', replay_l3_abstention: l3?.abstention ?? '',
      replay_l3_qc_trust: d.di.qc.get(r.sec)?.trust ?? '', replay_l3_qc_reasons: d.di.qc.get(r.sec)?.reasons ?? [],
      stored_c4_kmh: d.stored.c4?.get(r.sec)?.speed ?? '', replay_c4_kmh: c4?.valueKmh ?? '', c4_quality: c4?.quality ?? '', c4_flags: c4?.flags ?? [], c4_support_span_s: c4?.supportSpanS ?? '',
      stored_fsm_state: d.stored.fsm?.get(r.sec) ?? '', replay_fsm_state: d.fsmBy.get(r.sec)?.state ?? '', replay_fsm_quality: d.fsmBy.get(r.sec)?.evidenceQuality ?? '',
      obd_kmh: d.obd.get(r.sec) ?? '',
      err_replay_c4: r.ref != null && c4?.valueKmh != null ? L.round(c4.valueKmh - r.ref, 2) : '',
      err_replay_l3: r.ref != null && l3?.speed != null ? L.round(l3.speed - r.ref, 2) : '',
    };
  });
  fs.writeFileSync(path.join(outDir, `${d.id}_comparison.csv`), L.toCsv(table, Object.keys(table[0])));

  return { id: d.id, identity: d.identity, coverage, speed, commonSupport: common, speedQc: qc, implausibleEstimates: implausible, motion, timing, sensitivity, storedVsReplayDrift: drift, sparsePosition: sparse, confirmedStillEvidence: stillEvidence, worstReplayC4: worst, events, storedVersions: d.stored.versions ?? null };
}

function countBy(arr) {
  const m = {};
  for (const x of arr) m[x] = (m[x] ?? 0) + 1;
  return m;
}

// ---------- run ----------
const drives = [tiguan(), tesla21('TRIP_1', 1), tesla21('TRIP_2', 2), tesla16()];
const results = drives.map(evaluateDrive);

// overall (pooled seconds) for replay paths; EVAL-only pool reported separately (TIG22 + TES16)
function pooled(ids, name) {
  const errs = [];
  for (const d of drives) {
    if (!ids.includes(d.id)) continue;
    const getters = {
      replay_c4: (sec) => d.c4By.get(sec)?.valueKmh ?? null,
      replay_l3: (sec) => d.di.map.get(sec)?.speed ?? null,
      replay_l3_qc: (sec) => d.di.qc.get(sec)?.speed ?? null,
      stored_l3: (sec) => d.stored.l3?.get(sec)?.speed ?? null,
    };
    const get = getters[name];
    for (const r of d.rows) { if (r.ref == null || !d.gridSecs.has(r.sec)) continue; const v = get(r.sec); if (v != null) errs.push(v - r.ref); }
  }
  return L.metrics(errs);
}
const allIds = drives.map((d) => d.id);
const evalIds = ['TIG22', 'TES16'];
const overall = {
  allDrives: Object.fromEntries(['replay_l3', 'replay_l3_qc', 'replay_c4', 'stored_l3'].map((n) => [n, pooled(allIds, n)])),
  evalDrivesOnly_TIG22_TES16: Object.fromEntries(['replay_l3', 'replay_l3_qc', 'replay_c4', 'stored_l3'].map((n) => [n, pooled(evalIds, n)])),
  roles: { TIG22: 'EVAL for C4 main (DEV for #2134)', 'TES21-1': 'DEV (motion-core design)', 'TES21-2': 'DEV (motion-core design)', TES16: 'EVAL' },
};

const summary = {
  schema: 'DS4_SPEED_VIDEO_REFERENCE_EVAL_V1', generatedAtUtc: new Date().toISOString(), versions,
  rulesFile: 'EVALUATION_RULES.md', primaryShiftS: 0, stripObdSpeedInfluence, drives: results, overall, inputs: inputManifest,
};
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');

// console digest
for (const r of results) {
  const s = r.speed;
  const line = (n) => s[n] ? `${n}: n=${s[n].all.n} MAE=${s[n].all.maeKmh} P95=${s[n].all.p95AbsKmh} max=${s[n].all.maxAbsKmh} bias=${s[n].all.biasKmh} cov=${s[n].coverage.paired}/${s[n].coverage.readable}` : `${n}: -`;
  console.log(`\n== ${r.id} (${r.identity.tripId}) grid ${r.coverage.gridLabels} present ${r.coverage.positionPresent} ref readable ${r.coverage.referenceReadable}`);
  for (const n of ['stored_l3', 'replay_l3', 'replay_l3_qc', 'stored_c4', 'replay_c4', 'obd']) if (s[n]) console.log('  ' + line(n));
  console.log('  speedQc', JSON.stringify(r.speedQc));
  for (const n of Object.keys(r.implausibleEstimates)) if (r.implausibleEstimates[n]?.count) console.log(`  implausible(>${r.implausibleEstimates.thresholdKmh}) ${n}: ${r.implausibleEstimates[n].count} s -> excl MAE=${r.implausibleEstimates[n].metricsExcludingImplausible.maeKmh} P95=${r.implausibleEstimates[n].metricsExcludingImplausible.p95AbsKmh} max=${r.implausibleEstimates[n].metricsExcludingImplausible.maxAbsKmh}`);
  for (const n of Object.keys(r.motion)) { const m = r.motion[n]; console.log(`  motion ${n}: still_core=${m.confirmedStillCoreSecs} falseMotion=${m.falseMotionInConfirmedStill} noClaim=${m.stillNoClaim} | moving=${m.confirmedMotionSecs} falseStill=${m.falseStillInConfirmedMotion} noClaim=${m.motionNoClaim}`); }
  for (const n of Object.keys(r.timing)) { const t = r.timing[n]; console.log(`  timing ${n}: stop found=${t.stop.found}/${t.stop.evaluated} med=${t.stop.medianOffsetS} [${t.stop.minOffsetS},${t.stop.maxOffsetS}] | start found=${t.start.found}/${t.start.evaluated} med=${t.start.medianOffsetS} [${t.start.minOffsetS},${t.start.maxOffsetS}]`); }
  console.log('  drift', JSON.stringify(r.storedVsReplayDrift));
  console.log('  events', JSON.stringify({ replay: r.events.replay.count, stored: r.events.stored?.count ?? null, signOk: r.events.replay.deltaEqualsKindSignedDiff, nonNeg: r.events.replay.deltaNonNegative }));
}
console.log('\noverall', JSON.stringify(overall, null, 1));
console.log(`\nwritten: ${path.relative(thisRepo, outDir)} (code ${tag} @ ${codeSha})`);
