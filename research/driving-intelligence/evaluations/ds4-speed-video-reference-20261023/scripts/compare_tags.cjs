#!/usr/bin/env node
'use strict';
/**
 * Candidate assessment of one replay tag against another on identical inputs, strictly along
 * EVALUATION_RULES.md §9 (criteria fixed before any candidate was evaluated).
 *
 *   node scripts/compare_tags.cjs --baseline main --candidate pr2134 [--series replay_c4]
 *
 * Reads outputs/<tag>/<drive>_comparison.csv and outputs/<tag>/summary.json for both tags and writes
 * outputs/candidate_<candidate>_vs_<baseline>.json. Nothing is recomputed from DS4 code here.
 */
const fs = require('node:fs');
const path = require('node:path');
const L = require('./eval_lib.cjs');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const baseTag = opt('--baseline', 'main');
const candTag = opt('--candidate', 'pr2134');
const seriesName = opt('--series', 'replay_c4');
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
const col = `${seriesName}_kmh`;
const claimKey = seriesName === 'replay_c4' ? 'replay_c4' : seriesName;

// Candidate-derivation roles (rules §2): a candidate derived on a drive cannot claim independent validation there.
const DERIVED_ON = { pr2134: ['TIG22'] };
const EVAL_DRIVES = ['TIG22', 'TES16'];

const perDrive = {};
for (const d of base.summary.drives) {
  const id = d.id;
  const dc = cand.summary.drives.find((x) => x.id === id);
  const bRows = new Map(base.csv[id].map((r) => [r.label_utc, r]));
  const commonErrsA = [], commonErrsB = [];
  const withheldByCandidate = [], addedByCandidate = [];
  let pairedA = 0, pairedB = 0;
  for (const rc of cand.csv[id]) {
    const rb = bRows.get(rc.label_utc);
    if (!rb) throw new Error(`row mismatch ${id} ${rc.label_utc}`);
    if (rc.ref_kmh === '' || rc.in_grid !== '1') continue;
    const ref = Number(rc.ref_kmh);
    const a = rb[col] === '' ? null : Number(rb[col]);
    const b = rc[col] === '' ? null : Number(rc[col]);
    if (a != null) pairedA++;
    if (b != null) pairedB++;
    if (a != null && b != null) { commonErrsA.push(a - ref); commonErrsB.push(b - ref); }
    else if (a != null) withheldByCandidate.push({ label: rc.label_utc, baselineValue: L.round(a, 1), ref, implausible: a > 250 });
    else if (b != null) addedByCandidate.push({ label: rc.label_utc, candidateValue: L.round(b, 1), ref });
  }
  const mA = L.metrics(commonErrsA), mB = L.metrics(commonErrsB);
  const maeDropAbs = mA.n ? L.round(mA.maeKmh - mB.maeKmh, 3) : null;
  const maeDropPct = mA.n && mA.maeKmh > 0 ? L.round((100 * (mA.maeKmh - mB.maeKmh)) / mA.maeKmh, 1) : null;
  const p95Delta = mA.n ? L.round(mB.p95AbsKmh - mA.p95AbsKmh, 3) : null;

  const motionA = d.motion, motionB = dc.motion;
  const timingA = d.timing, timingB = dc.timing;
  const motionDelta = {};
  for (const k of Object.keys(motionB)) {
    if (!motionA[k]) continue;
    motionDelta[k] = {
      falseMotion: [motionA[k].falseMotionInConfirmedStill, motionB[k].falseMotionInConfirmedStill],
      falseStill: [motionA[k].falseStillInConfirmedMotion, motionB[k].falseStillInConfirmedMotion],
      stillNoClaim: [motionA[k].stillNoClaim, motionB[k].stillNoClaim],
      motionNoClaim: [motionA[k].motionNoClaim, motionB[k].motionNoClaim],
      stopMedianOffsetS: [timingA[k]?.stop.medianOffsetS ?? null, timingB[k]?.stop.medianOffsetS ?? null],
      startMedianOffsetS: [timingA[k]?.start.medianOffsetS ?? null, timingB[k]?.start.medianOffsetS ?? null],
    };
  }
  const eventsA = new Set(d.events.replayKeys), eventsB = new Set(dc.events.replayKeys);
  const events = {
    count: [d.events.replay.count, dc.events.replay.count],
    onlyBaseline: [...eventsA].filter((k) => !eventsB.has(k)),
    onlyCandidate: [...eventsB].filter((k) => !eventsA.has(k)),
  };

  perDrive[id] = {
    role: { evalDrive: EVAL_DRIVES.includes(id), candidateDerivedHere: (DERIVED_ON[candTag] ?? []).includes(id) },
    commonSupport: { n: mA.n, baseline: mA, candidate: mB, maeDropKmh: maeDropAbs, maeDropPct, p95DeltaKmh: p95Delta },
    coverage: { baselinePaired: pairedA, candidatePaired: pairedB, withheldByCandidate, addedByCandidate,
      withheldImplausible: withheldByCandidate.filter((w) => w.implausible).length, withheldPlausible: withheldByCandidate.filter((w) => !w.implausible).length },
    motionAndTiming: motionDelta,
    events,
    versions: { baseline: base.summary.versions, candidate: cand.summary.versions },
  };
}

// ---- criteria §9 (mechanical reading; interpretation stays in REPORT.md) ----
const crit = {};
const improvedEval = Object.entries(perDrive).filter(([id, x]) => x.role.evalDrive && x.commonSupport.n > 0 &&
  (x.commonSupport.maeDropPct >= 10 || x.commonSupport.maeDropKmh >= 0.3) && x.commonSupport.p95DeltaKmh <= 0.1).map(([id]) => id);
const regressed = Object.entries(perDrive).filter(([id, x]) => x.commonSupport.n > 0 && (x.commonSupport.maeDropKmh < -0.1 || x.commonSupport.p95DeltaKmh > 0.5)).map(([id]) => id);
crit.c1_commonSupport = { improvedEvalDrives: improvedEval, regressedDrives: regressed, pass: improvedEval.length > 0 && regressed.length === 0 };
const coverageBelow = Object.entries(perDrive).filter(([, x]) => x.coverage.candidatePaired < x.coverage.baselinePaired).map(([id, x]) => ({ id, delta: x.coverage.candidatePaired - x.coverage.baselinePaired, withheldImplausible: x.coverage.withheldImplausible, withheldPlausible: x.coverage.withheldPlausible }));
crit.c2_coverage = { drivesBelowBaseline: coverageBelow, passStrict: coverageBelow.length === 0, passIfOnlyImplausibleWithheld: coverageBelow.every((c) => c.withheldPlausible === 0) };
crit.c3_latency = { c4InputHorizonForwardS: [base.summary.versions.c4InputHorizonForwardS, cand.summary.versions.c4InputHorizonForwardS], pass: base.summary.versions.c4InputHorizonForwardS === cand.summary.versions.c4InputHorizonForwardS };
const motionWorse = [];
for (const [id, x] of Object.entries(perDrive)) for (const [k, m] of Object.entries(x.motionAndTiming)) {
  if (!['replay_c4', 'replay_fsm'].includes(k)) continue;
  if (m.falseMotion[1] > m.falseMotion[0] || m.falseStill[1] > m.falseStill[0]) motionWorse.push({ id, path: k, falseMotion: m.falseMotion, falseStill: m.falseStill });
  const worseTiming = (pair) => pair[0] != null && pair[1] != null && Math.abs(pair[1]) - Math.abs(pair[0]) > 1;
  if (worseTiming(m.stopMedianOffsetS) || worseTiming(m.startMedianOffsetS)) motionWorse.push({ id, path: k, stop: m.stopMedianOffsetS, start: m.startMedianOffsetS });
}
crit.c4_motion = { violations: motionWorse, pass: motionWorse.length === 0 };
crit.c5_eventParity = Object.fromEntries(Object.entries(perDrive).map(([id, x]) => [id, x.events]));
crit.c6_devEval = { independentEvalDrivesForCandidate: Object.entries(perDrive).filter(([, x]) => x.role.evalDrive && !x.role.candidateDerivedHere).map(([id]) => id), derivedOn: DERIVED_ON[candTag] ?? [] };
const independentImprovement = improvedEval.filter((id) => !(DERIVED_ON[candTag] ?? []).includes(id));
crit.verdict = {
  provenImprovementOnIndependentEvalDrive: independentImprovement.length > 0,
  improvementOnlyOnDerivationDrive: improvedEval.length > 0 && independentImprovement.length === 0,
  independentDrivesUnchanged: crit.c6_devEval.independentEvalDrivesForCandidate.filter((id) => perDrive[id].commonSupport.maeDropKmh === 0 && perDrive[id].coverage.candidatePaired === perDrive[id].coverage.baselinePaired),
};

const out = { schema: 'DS4_SPEED_CANDIDATE_ASSESSMENT_V1', generatedAtUtc: new Date().toISOString(), baseline: { tag: baseTag, codeSha: base.summary.versions.codeSha }, candidate: { tag: candTag, codeSha: cand.summary.versions.codeSha }, series: seriesName, rules: 'EVALUATION_RULES.md §9', perDrive, criteria: crit };
const outFile = path.join(outDir, `candidate_${candTag}_vs_${baseTag}_${seriesName}.json`);
fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n');

for (const [id, x] of Object.entries(perDrive)) {
  const c = x.commonSupport;
  console.log(`${id} [${x.role.evalDrive ? 'EVAL' : 'DEV'}${x.role.candidateDerivedHere ? ', candidate derived here' : ''}] common n=${c.n} MAE ${c.baseline.maeKmh ?? '-'} -> ${c.candidate.maeKmh ?? '-'} (${c.maeDropPct ?? '-'} %) P95 ${c.baseline.p95AbsKmh ?? '-'} -> ${c.candidate.p95AbsKmh ?? '-'} max ${c.baseline.maxAbsKmh ?? '-'} -> ${c.candidate.maxAbsKmh ?? '-'} | paired ${x.coverage.baselinePaired} -> ${x.coverage.candidatePaired} (withheld implausible ${x.coverage.withheldImplausible}, plausible ${x.coverage.withheldPlausible}) | events ${x.events.count.join('->')}`);
  for (const [k, m] of Object.entries(x.motionAndTiming)) if (['replay_c4', 'replay_fsm'].includes(k)) console.log(`   ${k}: falseMotion ${m.falseMotion.join('->')} falseStill ${m.falseStill.join('->')} motionNoClaim ${m.motionNoClaim.join('->')} stopMed ${m.stopMedianOffsetS.join('->')} startMed ${m.startMedianOffsetS.join('->')}`);
}
console.log('criteria', JSON.stringify(crit, null, 1));
console.log(`written: ${path.relative(evalRoot, outFile)}`);
