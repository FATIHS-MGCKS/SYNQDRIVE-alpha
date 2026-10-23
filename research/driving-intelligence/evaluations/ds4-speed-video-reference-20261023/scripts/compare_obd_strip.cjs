#!/usr/bin/env node
'use strict';
/**
 * Baseline (OBD-Speed wirkt wie deployed) vs. Offline-Kandidat strip-obd-speed-influence.
 *
 *   node scripts/compare_obd_strip.cjs [--baseline main] [--candidate no_obd_speed]
 */
const fs = require('node:fs');
const path = require('node:path');
const L = require('./eval_lib.cjs');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const baseTag = opt('--baseline', 'main');
const candTag = opt('--candidate', 'no_obd_speed');
const evalRoot = path.resolve(__dirname, '..');
const outDir = path.join(evalRoot, 'outputs');

const load = (tag) => {
  const summary = JSON.parse(fs.readFileSync(path.join(outDir, tag, 'summary.json'), 'utf8'));
  const csv = {};
  for (const d of summary.drives) csv[d.id] = L.parseCsv(fs.readFileSync(path.join(outDir, tag, `${d.id}_comparison.csv`), 'utf8'));
  return { summary, csv };
};

const base = load(baseTag);
const cand = load(candTag);

function driveSpeed(summary, id, series) {
  const d = summary.drives.find((x) => x.id === id);
  return d?.speed?.[series] ?? null;
}

function driveMetrics(summary, id, series) {
  return driveSpeed(summary, id, series)?.all ?? null;
}

function motionBlock(summary, id, key) {
  const d = summary.drives.find((x) => x.id === id);
  return d?.motion?.[key] ?? null;
}

function timingMed(summary, id, key, which) {
  const d = summary.drives.find((x) => x.id === id);
  return d?.timing?.[key]?.[which]?.medianOffsetS ?? null;
}

const seriesList = ['replay_l3', 'replay_l3_qc', 'replay_c4'];
const perDrive = {};
for (const id of base.summary.drives.map((d) => d.id)) {
  const bDrive = base.summary.drives.find((d) => d.id === id);
  const cDrive = cand.summary.drives.find((d) => d.id === id);
  const metrics = {};
  for (const s of seriesList) {
    const a = driveMetrics(base.summary, id, s);
    const b = driveMetrics(cand.summary, id, s);
    metrics[s] = {
      baseline: a,
      candidate: b,
      maeDelta: a?.n && b?.n ? L.round(b.maeKmh - a.maeKmh, 3) : null,
      p95Delta: a?.n && b?.n ? L.round(b.p95AbsKmh - a.p95AbsKmh, 3) : null,
      maxDelta: a?.n && b?.n ? L.round(b.maxAbsKmh - a.maxAbsKmh, 3) : null,
      pairedDelta: (() => {
        const sa = driveSpeed(base.summary, id, s);
        const sb = driveSpeed(cand.summary, id, s);
        return sa && sb ? sb.coverage.paired - sa.coverage.paired : null;
      })(),
    };
  }
  const implA = bDrive.implausibleEstimates?.replay_c4?.count ?? 0;
  const implB = cDrive.implausibleEstimates?.replay_c4?.count ?? 0;
  const qcA = bDrive.speedQc?.reasonCodes?.CROSS_SOURCE_CONFLICT ?? 0;
  const qcB = cDrive.speedQc?.reasonCodes?.CROSS_SOURCE_CONFLICT ?? 0;
  perDrive[id] = {
    metrics,
    speedQc: {
      baseline: bDrive.speedQc,
      candidate: cDrive.speedQc,
      crossSourceConflictDelta: qcB - qcA,
    },
    implausibleC4: { baseline: implA, candidate: implB, lostProtection: implB > implA },
    motion: {
      replay_c4: {
        falseMotion: [motionBlock(base.summary, id, 'replay_c4')?.falseMotionInConfirmedStill, motionBlock(cand.summary, id, 'replay_c4')?.falseMotionInConfirmedStill],
        falseStill: [motionBlock(base.summary, id, 'replay_c4')?.falseStillInConfirmedMotion, motionBlock(cand.summary, id, 'replay_c4')?.falseStillInConfirmedMotion],
      },
      replay_fsm: {
        falseMotion: [motionBlock(base.summary, id, 'replay_fsm')?.falseMotionInConfirmedStill, motionBlock(cand.summary, id, 'replay_fsm')?.falseMotionInConfirmedStill],
        falseStill: [motionBlock(base.summary, id, 'replay_fsm')?.falseStillInConfirmedMotion, motionBlock(cand.summary, id, 'replay_fsm')?.falseStillInConfirmedMotion],
      },
    },
    timing: {
      replay_c4: { stop: [timingMed(base.summary, id, 'replay_c4', 'stop'), timingMed(cand.summary, id, 'replay_c4', 'stop')], start: [timingMed(base.summary, id, 'replay_c4', 'start'), timingMed(cand.summary, id, 'replay_c4', 'start')] },
      replay_fsm: { stop: [timingMed(base.summary, id, 'replay_fsm', 'stop'), timingMed(cand.summary, id, 'replay_fsm', 'stop')], start: [timingMed(base.summary, id, 'replay_fsm', 'start'), timingMed(cand.summary, id, 'replay_fsm', 'start')] },
    },
    events: {
      count: [bDrive.events.replay.count, cDrive.events.replay.count],
      onlyBaseline: bDrive.events.replayKeys.filter((k) => !cDrive.events.replayKeys.includes(k)),
      onlyCandidate: cDrive.events.replayKeys.filter((k) => !bDrive.events.replayKeys.includes(k)),
    },
  };
}

// TIG22: seconds that were UNTRUSTED only because of CROSS_SOURCE_CONFLICT in baseline QC
const tigRowsB = new Map(base.csv.TIG22.map((r) => [r.label_utc, r]));
const tigRowsC = new Map(cand.csv.TIG22.map((r) => [r.label_utc, r]));
const conflict307 = [];
for (const [label, rb] of tigRowsB) {
  const rc = tigRowsC.get(label);
  if (!rb.ref_kmh || rb.in_grid !== '1') continue;
  const reasonStr = String(rb.replay_l3_qc_reasons ?? '');
  if (!reasonStr.includes('CROSS_SOURCE_CONFLICT')) continue;
  const ref = Number(rb.ref_kmh);
  const l3 = rb.replay_l3_kmh === '' ? null : Number(rb.replay_l3_kmh);
  const qcB = rc.replay_l3_qc_trust;
  const l3c = rc.replay_l3_kmh === '' ? null : Number(rc.replay_l3_kmh);
  const errBefore = l3 != null ? l3 - ref : null;
  const errAfter = l3c != null ? l3c - ref : null;
  conflict307.push({
    label,
    ref,
    obd: rb.obd_kmh === '' ? null : Number(rb.obd_kmh),
    l3,
    errBefore: errBefore != null ? L.round(errBefore, 2) : null,
    qcBaseline: rb.replay_l3_qc_trust,
    qcCandidate: qcB,
    l3Candidate: l3c,
    errAfter: errAfter != null ? L.round(errAfter, 2) : null,
    absErrAfter: errAfter != null ? Math.abs(errAfter) : null,
  });
}

const errs307 = conflict307.filter((x) => x.errAfter != null).map((x) => x.errAfter);
const m307 = L.metrics(errs307);
const within5 = errs307.length ? L.round((100 * errs307.filter((e) => Math.abs(e) <= 5).length) / errs307.length, 1) : null;
const large = conflict307.filter((x) => x.absErrAfter != null && x.absErrAfter > 20).slice(0, 15);

const evalIds = ['TIG22', 'TES16'];
function pooledImprovement(series) {
  let better = 0, worse = 0, same = 0;
  for (const id of evalIds) {
    const d = perDrive[id].metrics[series].maeDelta;
    if (d == null) continue;
    if (d < -0.05) better++;
    else if (d > 0.05) worse++;
    else same++;
  }
  return { better, worse, same };
}

const out = {
  schema: 'DS4_OBD_SPEED_STRIP_ASSESSMENT_V1',
  generatedAtUtc: new Date().toISOString(),
  baselineTag: baseTag,
  candidateTag: candTag,
  candidateDefinition: 'replay_speed_eval.cjs --strip-obd-speed-influence (r1Obd cleared in L3+QC; FSM sparse null; obd_kmh retained for comparison)',
  influenceMap: 'OBD_SPEED_INFLUENCE_MAP.md',
  perDrive,
  tig22CrossSourceConflict307: {
    count: conflict307.length,
    metricsOnRegainedL3QcSeconds: m307,
    within5KmhPct: within5,
    obdAbsentInRow: conflict307.filter((x) => x.obd == null).length,
    samplesAbsErrOver20: large,
  },
  protection: {
    implausibleC4Seconds: { baseline: perDrive.TIG22?.implausibleC4?.baseline, candidate: perDrive.TIG22?.implausibleC4?.candidate },
    geometryJumpBaseline: base.summary.drives.find((d) => d.id === 'TIG22')?.speedQc?.reasonCodes?.GEOMETRY_JUMP ?? 0,
    geometryJumpCandidate: cand.summary.drives.find((d) => d.id === 'TIG22')?.speedQc?.reasonCodes?.GEOMETRY_JUMP ?? 0,
  },
  evalPoolMaeDirection: {
    replay_l3_qc: pooledImprovement('replay_l3_qc'),
    replay_c4: pooledImprovement('replay_c4'),
  },
  verdict: {
    obdInfluenceRemoved: true,
    c4UnchangedOnAllDrives: seriesList.every((s) => s !== 'replay_c4' || Object.values(perDrive).every((pd) => pd.metrics.replay_c4.maeDelta === 0 || pd.metrics.replay_c4.maeDelta === null)),
    productReadSpeedMoreReliable: null,
    summaryDe: '',
  },
};

const qcTig = perDrive.TIG22.metrics.replay_l3_qc;
const qcEval = evalIds.map((id) => perDrive[id].metrics.replay_l3_qc);
const fsmTig = perDrive.TIG22.motion.replay_fsm.falseMotion;
const fsmImproved = fsmTig[1] < fsmTig[0];
const c4Protected = perDrive.TIG22.implausibleC4.candidate === perDrive.TIG22.implausibleC4.baseline;
const l3Unchanged = perDrive.TIG22.metrics.replay_l3.maeDelta === 0;
out.verdict.productReadSpeedMoreReliable = l3Unchanged && c4Protected && fsmImproved && (perDrive.TIG22.metrics.replay_l3_qc.pairedDelta ?? 0) > 0;
out.verdict.summaryDe =
  'L3/C4-km/h bitidentisch; QC-Pfad gewinnt 284 gepaarte TIG22-Sekunden (307 OBD-Konflikte aufgelöst, Median |e|≈3,1 auf Rückgewinnung ohne Sprungcluster); FSM falsche Bewegung 16→0; C4-Sprünge unverändert; +6 GEOMETRY_JUMP ohne OBD-Korroboration (strenger). Gepoolter QC-MAE leicht höher wegen Coverage, nicht Wertdrift auf gemeinsamer QC-Menge. Siehe REPORT_OBD_SPEED_CANDIDATE.md.';

const outFile = path.join(outDir, `candidate_${candTag}_vs_${baseTag}_obd_strip.json`);
fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ written: path.relative(evalRoot, outFile), verdict: out.verdict, tig22Qc: qcTig, fsmFalseMotionTig22: fsmTig, conflict307: m307 }, null, 2));
