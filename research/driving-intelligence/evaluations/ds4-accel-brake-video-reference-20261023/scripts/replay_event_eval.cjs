#!/usr/bin/env node
'use strict';
/**
 * Offline replay of the DS4 manoeuvre-event detector (motion-core C4 → detectMotionManoeuvreEvents) against the
 * sealed video reference tables, evaluated per EVALUATION_RULES.md. No provider, DB or production access.
 *
 *   node scripts/replay_event_eval.cjs [--code-root <repo-checkout>] [--tag <label>] [--expect-sha <sha>]
 *
 * The DI directory of the code-root checkout must be clean; its HEAD SHA is recorded in every output.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const L = require('../../ds4-speed-video-reference-20261023/scripts/eval_lib.cjs');
const E = require('./event_eval_lib.cjs');

const evalRoot = path.resolve(__dirname, '..');
const speedEvalRoot = path.resolve(evalRoot, '../ds4-speed-video-reference-20261023');
const thisRepo = path.resolve(evalRoot, '../../../..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const codeRoot = path.resolve(opt('--code-root', thisRepo));
const tag = opt('--tag', 'match2s');
const matching = opt('--matching', tag === 'main' ? 'v1_bilateral' : 'v2_gap2s');
const expectSha = opt('--expect-sha', null);
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
const core = req('core/index.ts');

const GUARDS = core.MOTION_CORE_EVENT_GUARDS_V0_1_DEV;
const THR = core.MOTION_EVENT_HF_THRESHOLDS_V1;
const OPTIONS = core.MOTION_EVENT_V0_2_CANDIDATE_OPTIONS;

const versions = {
  tag, codeRoot, codeSha,
  c4: core.MOTION_CORE_SPEED_C4_VERSION,
  legConsistency: core.MOTION_CORE_LEG_CONSISTENCY_VERSION ?? null,
  events: core.motionEventVersionId(OPTIONS),
  thresholds: THR,
  guards: GUARDS,
  spikeReversionWindowS: core.MOTION_EVENT_SPIKE_REVERSION_WINDOW_S,
  eventRules: E.EVENT_RULES,
};

const inputManifest = [];
const readInput = (file) => {
  inputManifest.push({ file: path.relative(thisRepo, file), sha256: L.sha256File(file), bytes: fs.statSync(file).size });
  return fs.readFileSync(file);
};
const speedInput = (rel) => readInput(path.join(speedEvalRoot, 'inputs', rel));
const localInput = (rel) => readInput(path.join(evalRoot, 'inputs', rel));

const eventKey = (e) => `${e.kind}|${e.startLabel}|${e.endLabel}`;
const persistedView = (e) => ({ kind: e.kind, startLabel: e.startLabel, endLabel: e.endLabel, startSpeedKmh: e.startSpeedKmh, endSpeedKmh: e.endSpeedKmh, deltaKmh: e.deltaKmh, quality: e.quality, flags: [...(e.flags ?? [])].sort() });

// ---------- drive loaders (same inputs as the speed evaluation) ----------
function containerDrive(id, text, family, refRows, vehicleClass, role, extra) {
  const parsed = parseDiV0S4EvidenceContainer(text);
  const ad = adaptMotionCoreShadowEvidenceFromParsedContainer(parsed, family);
  const proc = processDiV0MotionCoreShadowTrip({ parsed, sourceFamily: family, pinnedSnapshotHash: parsed.snapshotHash, combinedInputIdentity: parsed.combinedInputIdentity, computedAt: new Date('2026-10-23T00:00:00Z') });
  const c4 = core.computeC4AdaptiveL3(ad.buckets);
  const events = core.detectMotionManoeuvreEvents(0, c4, 'C4_ADAPTIVE_L3', GUARDS.usableQualities, OPTIONS);
  // parity: standalone detector == processor payload (as wired in production)
  const a = JSON.stringify(events.map(persistedView));
  const b = JSON.stringify(proc.payload.events.map(persistedView));
  if (a !== b) throw new Error(`event parity with processor broken for ${id}`);
  return { id, identity: { tripId: parsed.tripId, snapshotHash: parsed.snapshotHash, sourceFamily: family, limitations: ad.limitations, vehicleClass, role }, buckets: ad.buckets, c4, events, refRows, processorVersions: proc.payload.contract.algorithmVersions, ...extra };
}

function tiguan() {
  const ref = L.parseCsv(speedInput('tiguan-20261022/reference/TIGUAN_2026-10-22_1Hz.csv').toString('utf8'));
  const refRows = ref.map((r) => ({ sec: L.secOf(r.time_utc_estimated), ref: L.numOrNull(r.speed_display_kmh), clip: r.source_clip }));
  const windows = L.parseCsv(speedInput('tiguan-20261022/reference/TIGUAN_2026-10-22_analysis_windows.csv').toString('utf8')).map((w) => ({
    kind: w.type === 'SPEED_INCREASE' ? 'ACCELERATION' : 'DECELERATION', clip: w.source_clip,
    startSec: L.secOf(w.start_time_local_estimated), endSec: L.secOf(w.end_time_local_estimated),
    startKmh: Number(w.start_speed_display_kmh), endKmh: Number(w.end_speed_display_kmh), durationS: Number(w.duration_s), meanDisplayAccelMps2: Number(w.mean_display_accel_mps2),
  }));
  speedInput('tiguan-20261022/reference/manifest.json');
  speedInput('tiguan-20261022/PROVENANCE_MANIFEST.json');
  const preDeploy = JSON.parse(speedInput('tiguan-20261022/snapshots/di_v0_motion_core_shadow_payload.json').toString('utf8'));
  const prodPayload = JSON.parse(localInput('tiguan-20261022/prod_run_v4_20261023/di_v0_motion_core_shadow_payload.json').toString('utf8'));
  const prodMeta = JSON.parse(localInput('tiguan-20261022/prod_run_v4_20261023/di_v0_motion_core_shadow_run_meta.json').toString('utf8'));
  const text = speedInput('tiguan-20261022/snapshots/di_v0_s4_evidence_container.bin').toString('utf8');
  return containerDrive('TIG22', text, 'RUPTELA_R1', refRows, 'TIGUAN', 'EVAL', { operatorWindows: windows, preDeployPayload: preDeploy, prodPayload, prodMeta });
}

function tesla21(key, tripNo) {
  const joined = L.parseCsv(speedInput('tesla-20261021/JOINED_REFERENCE_TABLE.csv').toString('utf8'));
  const seen = new Set();
  const refRows = [];
  for (const r of joined.filter((x) => x.trip === String(tripNo))) {
    const sec = L.secOf(r.bucket_label_utc);
    if (seen.has(sec)) continue;
    seen.add(sec);
    const readable = r.inclusion_flag === 'INCLUDE' && r.speed_status === 'VISIBLE_DISPLAY_VALUE';
    refRows.push({ sec, ref: readable ? L.numOrNull(r.tesla_speed_kmh_primary) : null, clip: r.clip });
  }
  refRows.sort((a, b) => a.sec - b.sec);
  const text = zlib.gunzipSync(speedInput(`tesla-20261021/s4_evidence/${key}_evidence_payload.gz`)).toString('utf8');
  return containerDrive(`TES21-${tripNo}`, text, 'API_SYNTHETIC', refRows, 'TESLA', 'DEV', {});
}

function tesla16() {
  const fx = path.join(thisRepo, 'architecture/drivingintelligence/evidence/ldi-10d/fixtures/tesla-20261016');
  const refJson = JSON.parse(readInput(path.join(fx, 'VIDEO_TACHO_REFERENCE.json')).toString('utf8'));
  const grid = JSON.parse(readInput(path.join(fx, 'TESLA_POSITION_GRID.json')).toString('utf8'));
  const refRows = refJson.rows.map((r) => ({ sec: L.secOf(r.bucketLabelUtc), ref: r.tachoKmh == null ? null : Number(r.tachoKmh), clip: r.videoFile }));
  const buckets = grid.buckets.map((b) => ({ bucketLabelUtc: b.bucketLabelUtc, availability: b.availability, latitude: b.latitude, longitude: b.longitude }));
  const c4 = core.computeC4AdaptiveL3(buckets);
  const events = core.detectMotionManoeuvreEvents(0, c4, 'C4_ADAPTIVE_L3', GUARDS.usableQualities, OPTIONS);
  return { id: 'TES16', identity: { tripId: grid.tripId, snapshotHash: grid.pinnedSnapshotHash, sourceFamily: 'API_SYNTHETIC', limitations: ['NO_R1_OBD_CHANNEL', 'POSITION_GRID_FIXTURE'], vehicleClass: 'TESLA', role: 'EVAL' }, buckets, c4, events, refRows, processorVersions: null };
}

// ---------- evaluation ----------
/**
 * Evaluate one drive. `events` defaults to the drive's baseline detector output; candidates pass their own list
 * (same C4 — parity is asserted by the caller). `isAccepted` defines the accepted subset (§12 N3).
 */
function buildMetricsLayers(eventRows, oracleRows, windowRows, runRows) {
  const accepted = eventRows.filter((r) => r.accepted);
  const verifiable = eventRows.filter((r) => !E.UNVERIFIED_CLASSES.includes(r.cls));
  const oracleHard = oracleRows.filter((o) => !o.borderline && o.status !== 'VERPASST_KEINE_DS4_GESCHWINDIGKEIT');
  const countStatus = (rows, key) => rows.reduce((m, r) => { m[r[key]] = (m[r[key]] ?? 0) + 1; return m; }, {});
  return {
    ds4: {
      detected: eventRows.length,
      accepted: accepted.length,
      verifiable: verifiable.length,
      notEvaluable: eventRows.length - verifiable.length,
    },
    t2_sameDetectorOnVideoSpeed: {
      oracleManoeuvres: oracleRows.length,
      oracleHardManoeuvres: oracleHard.length,
      detectedWithOracleMatch: eventRows.filter((r) => r.oracle_start_utc).length,
      acceptedWithOracleMatch: accepted.filter((r) => r.oracle_start_utc).length,
      correctTreffer: eventRows.filter((r) => r.cls === 'TREFFER').length,
      acceptedCorrectTreffer: accepted.filter((r) => r.cls === 'TREFFER').length,
      fragments: eventRows.filter((r) => r.cls === 'TREFFER_FRAGMENT').length,
      oracleByStatus: countStatus(oracleRows, 'status'),
      hardFalseAlarms: eventRows.filter((r) => r.cls === 'FEHLALARM').length,
      softOrIntensityFalse: eventRows.filter((r) => r.cls === 'WEICHER_FEHLALARM' || r.cls === 'FEHLALARM_INTENSITAET').length,
    },
    t1_operatorWindows: windowRows
      ? { windows: windowRows.length, byStatus: countStatus(windowRows, 'status') }
      : null,
    t3_visibleRuns: { runs: runRows.length, byStatus: countStatus(runRows, 'status') },
    nonEvaluable: {
      unverifizierbar: eventRows.filter((r) => r.cls === 'UNVERIFIZIERBAR').length,
      fehlalarmUnbestimmt: eventRows.filter((r) => r.cls === 'FEHLALARM_UNBESTIMMT').length,
      outsideReferenceWindowNotes: eventRows.filter((r) => (r.note || []).includes('AUSSERHALB_REFERENZFENSTER')).length,
    },
  };
}

function evaluateDrive(d, { events = d.events, isAccepted = E.isAcceptedBaseline, write = true, matching: matchingMode = matching } = {}) {
  const refBySec = new Map(d.refRows.map((r) => [r.sec, r.ref]));
  const readable = d.refRows.filter((r) => r.ref != null);
  const refMax = Math.max(...readable.map((r) => r.ref));
  const refFirst = d.refRows[0].sec;
  const refLast = d.refRows[d.refRows.length - 1].sec;

  // T2 oracle: same detector on the reference series
  const oracle = core.detectMotionManoeuvreEvents(0, E.referenceAsSpeedSamples(d.refRows, 'VIDEO_REFERENCE'), 'VIDEO_REFERENCE', ['OK'], OPTIONS);
  // T3 visible runs
  const runs = E.visibleRuns(d.refRows);

  const minDelta = THR.minDeltaKmh;
  const cls = E.classifyEvents(events, oracle, d.refRows, minDelta, { matching: matchingMode });
  const ctx = E.boundaryContext(d.c4, d.buckets, GUARDS.usableQualities, GUARDS.maxGapS);
  const acceptedKeys = new Set(events.filter(isAccepted).map(eventKey));

  // DS4 event rows
  const eventRows = cls.ds4.map((r) => {
    const ev = r.ev;
    const bf = E.boundaryFeatures(ev, ctx);
    const pl = E.plausibility(ev, d.identity.vehicleClass, refMax);
    const o = r.oracleIdx != null ? oracle[r.oracleIdx] : null;
    const refStart = refBySec.get(r.s);
    const refEnd = refBySec.get(r.e);
    const sg = E.sign(ev.kind);
    const dvRefSameWindow = refStart != null && refEnd != null ? L.round(sg * (refEnd - refStart), 1) : null;
    return {
      kind: ev.kind, start_utc: ev.startLabel, end_utc: ev.endLabel, duration_s: ev.durationS, steps: ev.steps,
      start_kmh: ev.startSpeedKmh, end_kmh: ev.endSpeedKmh, delta_kmh: ev.deltaKmh, mean_mps2: ev.meanAccelMps2, peak1s_mps2: ev.peakAccel1sMps2, peak2s_mps2: ev.peakAccel2sMps2,
      quality: ev.quality, flags: ev.flags, accepted: acceptedKeys.has(eventKey(ev)) ? 1 : 0,
      cls: r.cls, note: r.note,
      artefact_suspect_view: (r.cls === 'TREFFER' || r.cls === 'TREFFER_FRAGMENT') && dvRefSameWindow != null && Math.abs(ev.deltaKmh - dvRefSameWindow) > E.EVENT_RULES.artefactSuspectDeltaErrKmh ? 1 : 0,
      oracle_start_utc: o ? o.startLabel : '', oracle_end_utc: o ? o.endLabel : '', oracle_delta_kmh: o ? o.deltaKmh : '',
      start_offset_s: o ? r.s - L.secOf(o.startLabel) : '', end_offset_s: o ? r.e - L.secOf(o.endLabel) : '', duration_diff_s: o ? ev.durationS - o.durationS : '',
      delta_diff_kmh: o ? L.round(ev.deltaKmh - o.deltaKmh, 1) : '',
      ref_start_kmh: refStart ?? '', ref_end_kmh: refEnd ?? '', delta_err_same_window_kmh: dvRefSameWindow != null ? L.round(ev.deltaKmh - dvRefSameWindow, 1) : '',
      ref_dir_delta_kmh: r.refDelta?.deltaKmh ?? '', ref_peak1s_mps2: r.refIntensity?.peak1sMps2 ?? '', ref_peak2s_mps2: r.refIntensity?.peak2sMps2 ?? '', ref_readable_pairs: r.readablePairs ?? '',
      implausible: pl.implausible ? 1 : 0, plaus_bound_mps2: pl.boundMps2, over_ref_max: pl.overReferenceMax ? 1 : 0,
      near_boundary: bf.nearBoundary ? 1 : 0, secs_since_seg_start: bf.secsSinceSegmentStart ?? '', secs_to_seg_end: bf.secsToSegmentEnd ?? '',
      nearest_unusable_c4_s: bf.nearestUnusableC4S ?? '', nearest_quarantine_s: bf.nearestQuarantineS ?? '', nearest_position_gap_s: bf.nearestPositionGapS ?? '', non_ok_share: bf.nonOkShare ?? '',
      in_visible_run: runs.some((run) => run.kind === ev.kind && E.overlapS(r.s, r.e, run.startSec, run.endSec, E.EVENT_RULES.matchTolS) > 0) ? 1 : 0,
    };
  });

  // oracle rows
  const oracleRows = cls.oracleRows.map((orow) => {
    const o = orow.o;
    const status = E.oracleStatus(orow, ctx.c4BySec, GUARDS.usableQualities);
    const hit = orow.hits[0] ?? null;
    return {
      kind: o.kind, start_utc: o.startLabel, end_utc: o.endLabel, duration_s: o.durationS, start_kmh: o.startSpeedKmh, end_kmh: o.endSpeedKmh, delta_kmh: o.deltaKmh,
      mean_mps2: o.meanAccelMps2, peak1s_mps2: o.peakAccel1sMps2, peak2s_mps2: o.peakAccel2sMps2, oracle_quality: o.quality, oracle_flags: o.flags,
      borderline: o.peakAccel1sMps2 < THR.entryMps2 + E.EVENT_RULES.borderlineBandMps2 ? 1 : 0,
      status, ds4_hits: orow.hits.length,
      ds4_start_utc: hit ? hit.ev.startLabel : '', ds4_end_utc: hit ? hit.ev.endLabel : '', ds4_delta_kmh: hit ? hit.ev.deltaKmh : '',
      start_offset_s: hit ? hit.s - orow.s : '', end_offset_s: hit ? hit.e - orow.e : '',
      c4_null_or_unusable_in_window: (() => { let n = 0; for (let t = orow.s; t <= orow.e; t++) { const c = ctx.c4BySec.get(t); if (!c || c.valueKmh == null || !GUARDS.usableQualities.includes(c.quality)) n++; } return n; })(),
    };
  });

  // T3 visible runs
  const runRows = runs.map((run) => {
    const inten = E.referenceIntensity(refBySec, run.startSec, run.endSec, run.kind);
    const above = oracle.some((o) => o.kind === run.kind && E.overlapS(run.startSec, run.endSec, L.secOf(o.startLabel), L.secOf(o.endLabel), 0) > 0);
    const ds4 = events.filter((e) => e.kind === run.kind && E.overlapS(run.startSec, run.endSec, L.secOf(e.startLabel), L.secOf(e.endLabel), E.EVENT_RULES.matchTolS) > 0);
    let status;
    if (above) status = ds4.length ? 'ERKANNT' : 'VERPASST_OBERHALB_SCHWELLE';
    else status = ds4.length ? 'ERKANNT_UNTERHALB_SCHWELLE' : 'NICHT_ERWARTET_UNTERHALB_SCHWELLE';
    return {
      kind: run.kind, start_utc: L.labelOf(run.startSec * 1000), end_utc: L.labelOf(run.endSec * 1000), duration_s: run.durationS, start_kmh: run.startKmh, end_kmh: run.endKmh, delta_kmh: run.deltaKmh,
      mean_mps2: run.meanMps2, peak1s_mps2: inten.peak1sMps2, peak2s_mps2: inten.peak2sMps2, above_threshold: above ? 1 : 0, status, ds4_events: ds4.map(eventKey),
    };
  });

  // T1 operator windows (TIG22)
  let windowRows = null;
  if (d.operatorWindows) {
    windowRows = d.operatorWindows.map((w) => {
      const cands = events.filter((e) => e.kind === w.kind && E.overlapS(w.startSec, w.endSec, L.secOf(e.startLabel), L.secOf(e.endLabel), E.EVENT_RULES.matchTolS) > 0);
      const inten = E.referenceIntensity(refBySec, w.startSec, w.endSec, w.kind);
      const oracleIn = oracle.filter((o) => o.kind === w.kind && E.overlapS(w.startSec, w.endSec, L.secOf(o.startLabel), L.secOf(o.endLabel), 0) > 0);
      const best = cands.sort((a, b) => E.overlapS(w.startSec, w.endSec, L.secOf(b.startLabel), L.secOf(b.endLabel), 0) - E.overlapS(w.startSec, w.endSec, L.secOf(a.startLabel), L.secOf(a.endLabel), 0))[0] ?? null;
      let status;
      if (best) status = 'ERKANNT';
      else if (oracleIn.length) status = 'VERPASST_OBERHALB_SCHWELLE';
      else status = 'UNTERHALB_SCHWELLE';
      return {
        kind: w.kind, clip: w.clip, start_utc: L.labelOf(w.startSec * 1000), end_utc: L.labelOf(w.endSec * 1000), duration_s: w.durationS, start_kmh: w.startKmh, end_kmh: w.endKmh,
        delta_kmh: L.round(E.sign(w.kind) * (w.endKmh - w.startKmh), 1), mean_display_mps2: w.meanDisplayAccelMps2, ref_peak1s_mps2: inten.peak1sMps2, ref_peak2s_mps2: inten.peak2sMps2,
        oracle_events_in_window: oracleIn.length, status, ds4_events: cands.length,
        ds4_start_utc: best ? best.startLabel : '', ds4_end_utc: best ? best.endLabel : '', ds4_delta_kmh: best ? best.deltaKmh : '',
        start_offset_s: best ? L.secOf(best.startLabel) - w.startSec : '', end_offset_s: best ? L.secOf(best.endLabel) - w.endSec : '',
        duration_diff_s: best ? best.durationS - w.durationS : '', delta_diff_kmh: best ? L.round(best.deltaKmh - E.sign(w.kind) * (w.endKmh - w.startKmh), 1) : '',
      };
    });
  }

  // production parity + pre-deploy comparison (TIG22)
  let production = null;
  if (d.prodPayload && events === d.events) {
    const replayKeys = d.events.map(persistedView);
    const prodKeys = d.prodPayload.events.map(persistedView);
    const identical = JSON.stringify(replayKeys) === JSON.stringify(prodKeys);
    const preKeys = new Set(d.preDeployPayload.events.map(eventKey));
    const nowKeys = new Set(d.events.map(eventKey));
    production = {
      runId: d.prodMeta.run_id, createdAtUtc: d.prodMeta.created_at, bundle: d.prodMeta.shadow_bundle_version, pinnedSnapshotHash: d.prodMeta.pinned_snapshot_hash,
      snapshotHashMatchesReplayInput: d.prodMeta.pinned_snapshot_hash === d.identity.snapshotHash,
      prodEventCount: prodKeys.length, replayEventCount: replayKeys.length, identical,
      prodVersions: d.prodPayload.contract.algorithmVersions, replayVersions: d.processorVersions,
      preDeploy: {
        bundle: d.preDeployPayload.contract.algorithmVersions.bundle, eventCount: d.preDeployPayload.events.length,
        onlyPreDeploy: [...preKeys].filter((k) => !nowKeys.has(k)), onlyNow: [...nowKeys].filter((k) => !preKeys.has(k)),
      },
    };
  }

  // counters
  const count = (arr, key) => arr.reduce((m, r) => { m[r[key]] = (m[r[key]] ?? 0) + 1; return m; }, {});
  const verifiable = eventRows.filter((r) => !E.UNVERIFIED_CLASSES.includes(r.cls));
  const hits = eventRows.filter((r) => r.cls === 'TREFFER');
  // §12 N1 sensitivity: one-sided tolerance
  const strictCls = E.classifyEvents(events, oracle, d.refRows, minDelta, { matching: 'v1_bilateral', strict: true });
  const strictView = { ds4ByClass: count(strictCls.ds4, 'cls'), oracleByStatus: count(strictCls.oracleRows.map((orow) => ({ status: E.oracleStatus(orow, ctx.c4BySec, GUARDS.usableQualities) })), 'status') };
  // §12 N3 accepted subset (production eventAcceptedCount semantics or candidate acceptance rule)
  const acceptedEvents = events.filter((e) => acceptedKeys.has(eventKey(e)));
  const accCls = E.classifyEvents(acceptedEvents, oracle, d.refRows, minDelta, { matching: matchingMode });
  const accOracle = accCls.oracleRows.map((orow) => ({ status: E.oracleStatus(orow, ctx.c4BySec, GUARDS.usableQualities), borderline: orow.o.peakAccel1sMps2 < THR.entryMps2 + E.EVENT_RULES.borderlineBandMps2 }));
  const accHits = accCls.ds4.filter((r) => r.cls === 'TREFFER');
  const acceptedView = {
    events: acceptedEvents.length,
    ds4ByClass: count(accCls.ds4, 'cls'),
    oracleByStatus: count(accOracle, 'status'),
    oracleHardMissed: accOracle.filter((o) => !o.borderline && o.status === 'VERPASST').length,
    oracleBorderlineMissed: accOracle.filter((o) => o.status === 'VERPASST_GRENZWERTIG').length,
    offsets: {
      start: E.offsetStats(accHits.map((r) => r.s - L.secOf(oracle[r.oracleIdx].startLabel))),
      end: E.offsetStats(accHits.map((r) => r.e - L.secOf(oracle[r.oracleIdx].endLabel))),
    },
  };
  const summary = {
    ds4Events: eventRows.length,
    acceptedEvents: acceptedEvents.length,
    artefactSuspectView: eventRows.filter((r) => r.artefact_suspect_view).map((r) => `${r.kind}|${r.start_utc}|${r.end_utc}|${r.start_kmh}->${r.end_kmh}|${r.cls}|err=${r.delta_err_same_window_kmh}`),
    sensitivity: { strict: strictView },
    accepted: acceptedView,
    ds4ByClass: count(eventRows, 'cls'),
    ds4ByQuality: count(eventRows, 'quality'),
    ds4ByKind: count(eventRows, 'kind'),
    verifiableEvents: verifiable.length,
    oracleEvents: oracleRows.length,
    oracleByStatus: count(oracleRows, 'status'),
    oracleBorderline: oracleRows.filter((r) => r.borderline).length,
    visibleRuns: runRows.length,
    visibleRunsByStatus: count(runRows, 'status'),
    operatorWindowsByStatus: windowRows ? count(windowRows, 'status') : null,
    offsets: {
      start: E.offsetStats(hits.map((r) => r.start_offset_s)),
      end: E.offsetStats(hits.map((r) => r.end_offset_s)),
      duration: E.offsetStats(hits.map((r) => r.duration_diff_s)),
    },
    deltaDiffKmh: L.metrics(hits.map((r) => r.delta_diff_kmh)),
    deltaErrSameWindowKmh: L.metrics(eventRows.filter((r) => r.delta_err_same_window_kmh !== '').map((r) => r.delta_err_same_window_kmh)),
    nearBoundary: { byClass: count(eventRows.filter((r) => r.near_boundary), 'cls'), total: eventRows.filter((r) => r.near_boundary).length },
    implausible: eventRows.filter((r) => r.implausible).map((r) => `${r.kind}|${r.start_utc}|${r.end_utc}|${r.start_kmh}->${r.end_kmh}|${r.cls}`),
    overReferenceMax: eventRows.filter((r) => r.over_ref_max).map((r) => `${r.kind}|${r.start_utc}|${r.end_utc}|${r.start_kmh}->${r.end_kmh}|${r.cls}`),
    byQualityAndClass: eventRows.reduce((m, r) => { const k = `${r.quality}|${r.cls}`; m[k] = (m[k] ?? 0) + 1; return m; }, {}),
    coverage: {
      referenceWindowUtc: [L.labelOf(refFirst * 1000), L.labelOf(refLast * 1000)], referenceRows: d.refRows.length, referenceReadable: readable.length, referenceMaxKmh: refMax,
      gridLabels: d.buckets.length, c4Numeric: d.c4.filter((s) => s.valueKmh != null).length, c4Usable: d.c4.filter((s) => s.valueKmh != null && GUARDS.usableQualities.includes(s.quality)).length,
      detectorSegments: ctx.segments.length, quarantinedSecs: ctx.quarantineSecs.length,
      eventsInsideReferenceWindow: eventRows.filter((r) => L.secOf(r.end_utc) >= refFirst && L.secOf(r.start_utc) <= refLast).length,
    },
    matchingMode: matchingMode,
    metricsLayers: buildMetricsLayers(eventRows, oracleRows, windowRows, runRows),
  };

  const writeCsv = (name, rows) => { if (write && rows && rows.length) fs.writeFileSync(path.join(outDir, `${d.id}_${name}.csv`), L.toCsv(rows, Object.keys(rows[0]))); };
  writeCsv('events', eventRows);
  writeCsv('oracle', oracleRows);
  writeCsv('visible_runs', runRows);
  if (windowRows) writeCsv('operator_windows', windowRows);

  return { id: d.id, identity: d.identity, summary, production, events: eventRows, oracle: oracleRows, visibleRuns: runRows, operatorWindows: windowRows };
}

// ---------- run ----------
const loadDrives = () => [tiguan(), tesla21('TRIP_1', 1), tesla21('TRIP_2', 2), tesla16()];

function pool(results, ids) {
  const rows = results.filter((r) => ids.includes(r.id));
  const sum = (fn) => rows.reduce((a, r) => a + fn(r), 0);
  const merge = (key) => rows.reduce((m, r) => { for (const [k, v] of Object.entries(r.summary[key])) m[k] = (m[k] ?? 0) + v; return m; }, {});
  const hits = rows.flatMap((r) => r.events.filter((e) => e.cls === 'TREFFER'));
  const oracleHard = rows.flatMap((r) => r.oracle.filter((o) => !o.borderline && o.status !== 'VERPASST_KEINE_DS4_GESCHWINDIGKEIT'));
  const hardFalse = sum((r) => (r.summary.ds4ByClass.FEHLALARM ?? 0));
  const verifiable = sum((r) => r.summary.verifiableEvents);
  return {
    drives: ids,
    ds4Events: sum((r) => r.summary.ds4Events), verifiableEvents: verifiable,
    ds4ByClass: merge('ds4ByClass'), oracleEvents: sum((r) => r.summary.oracleEvents), oracleByStatus: merge('oracleByStatus'),
    visibleRunsByStatus: merge('visibleRunsByStatus'),
    recallHardOracle: oracleHard.length ? L.round(oracleHard.filter((o) => o.status === 'ERKANNT' || o.status === 'ABGEDECKT_DURCH_VERSCHMELZUNG').length / oracleHard.length, 3) : null,
    recallHardOracleDenominator: oracleHard.length,
    hardFalseAlarmShareOfVerifiable: verifiable ? L.round(hardFalse / verifiable, 3) : null,
    offsets: { start: E.offsetStats(hits.map((r) => r.start_offset_s)), end: E.offsetStats(hits.map((r) => r.end_offset_s)), duration: E.offsetStats(hits.map((r) => r.duration_diff_s)) },
    deltaDiffKmh: L.metrics(hits.map((r) => r.delta_diff_kmh)),
    accepted: {
      events: sum((r) => r.summary.accepted.events),
      ds4ByClass: rows.reduce((m, r) => { for (const [k, v] of Object.entries(r.summary.accepted.ds4ByClass)) m[k] = (m[k] ?? 0) + v; return m; }, {}),
      oracleByStatus: rows.reduce((m, r) => { for (const [k, v] of Object.entries(r.summary.accepted.oracleByStatus)) m[k] = (m[k] ?? 0) + v; return m; }, {}),
    },
    strict: { ds4ByClass: rows.reduce((m, r) => { for (const [k, v] of Object.entries(r.summary.sensitivity.strict.ds4ByClass)) m[k] = (m[k] ?? 0) + v; return m; }, {}) },
  };
}

function main() {
const drives = loadDrives();
const results = drives.map((d) => evaluateDrive(d));
const summary = {
  schema: matching === 'v2_gap2s' ? 'DS4_ACCEL_BRAKE_VIDEO_REFERENCE_EVAL_V2' : 'DS4_ACCEL_BRAKE_VIDEO_REFERENCE_EVAL_V1',
  generatedAtUtc: new Date().toISOString(), matchingMode: matching, versions, rulesFile: 'EVALUATION_RULES.md',
  drives: results.map((r) => ({ id: r.id, identity: r.identity, summary: r.summary, production: r.production })),
  pooled: { EVAL_TIG22_TES16: pool(results, ['TIG22', 'TES16']), DEV_TES21: pool(results, ['TES21-1', 'TES21-2']), ALL: pool(results, results.map((r) => r.id)) },
  inputs: inputManifest,
};
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');

for (const r of results) {
  console.log(`\n== ${r.id} (${r.identity.tripId}, ${r.identity.role}) ref ${r.summary.coverage.referenceWindowUtc.join('..')} readable ${r.summary.coverage.referenceReadable}`);
  console.log('  ds4', r.summary.ds4Events, JSON.stringify(r.summary.ds4ByClass), 'quality', JSON.stringify(r.summary.ds4ByQuality));
  console.log('  oracle', r.summary.oracleEvents, JSON.stringify(r.summary.oracleByStatus), 'borderline', r.summary.oracleBorderline);
  console.log('  visibleRuns', r.summary.visibleRuns, JSON.stringify(r.summary.visibleRunsByStatus));
  if (r.summary.operatorWindowsByStatus) console.log('  operatorWindows', JSON.stringify(r.summary.operatorWindowsByStatus));
  console.log('  offsets', JSON.stringify(r.summary.offsets));
  console.log('  deltaDiff', JSON.stringify(r.summary.deltaDiffKmh), 'sameWindow', JSON.stringify(r.summary.deltaErrSameWindowKmh));
  console.log('  nearBoundary', JSON.stringify(r.summary.nearBoundary), 'implausible', r.summary.implausible.length, 'overRefMax', r.summary.overReferenceMax.length);
  if (r.production) console.log('  production', JSON.stringify({ identical: r.production.identical, prod: r.production.prodEventCount, replay: r.production.replayEventCount, preDeploy: r.production.preDeploy.eventCount, onlyPre: r.production.preDeploy.onlyPreDeploy.length, onlyNow: r.production.preDeploy.onlyNow.length }));
}
console.log('\npooled', JSON.stringify(summary.pooled, null, 1));
console.log(`\nwritten: ${path.relative(thisRepo, outDir)} (code ${tag} @ ${codeSha})`);
}

if (require.main === module) main();

module.exports = { loadDrives, evaluateDrive, pool, core, GUARDS, THR, OPTIONS, versions, inputManifest, eventKey, persistedView, codeSha, tag, matching, outDir, thisRepo };
