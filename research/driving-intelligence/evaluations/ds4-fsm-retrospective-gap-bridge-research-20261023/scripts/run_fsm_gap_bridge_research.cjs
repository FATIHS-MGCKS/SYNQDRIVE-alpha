#!/usr/bin/env node
'use strict';
/**
 * Offline before/after: production FSM (V0_3 candidate options) vs research post-pass FSM_GAP_BRIDGE_RESEARCH_V1.
 * C4/C5.1 speeds and event detector inputs unchanged.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const evalRoot = path.resolve(__dirname, '..');
const thisRepo = path.resolve(evalRoot, '../../../..');
const refEvalRoot = path.resolve(evalRoot, '../ds4-speed-video-reference-20261023');
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const codeRoot = path.resolve(opt('--code-root', thisRepo));
const outDir = path.join(evalRoot, 'outputs', 'run_v2_native_fsm');
fs.mkdirSync(outDir, { recursive: true });

const DI = 'backend/src/modules/vehicle-intelligence/driving-intelligence';
const codeSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: codeRoot }).toString().trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--', DI], { cwd: codeRoot }).toString().trim();
if (dirty) {
  console.warn('WARN: DI directory not clean (research-only run continues):\n' + dirty);
}

require(path.join(codeRoot, 'backend/node_modules/ts-node')).register({
  transpileOnly: true,
  project: path.join(codeRoot, 'backend/tsconfig.json'),
});
const req = (rel) => require(path.join(codeRoot, DI, rel));
const core = req('core/index.ts');
const { processDiV0MotionCoreShadowTrip } = req('motion-core-shadow-worker/di-v0-motion-core-shadow-processor.ts');
const { withImplausibleLegEndpointsQuarantined } = req('core/kinematics/leg-consistency.ts');

const L = require(path.join(refEvalRoot, 'scripts/eval_lib.cjs'));
// Reuse sealed drive loaders via drive_loaders_bridge (inputs from ds4-speed-video-reference-20261023).
const { loadAllDrives } = require('./drive_loaders_bridge.cjs');
const CANDIDATE_ID = 'FSM_GAP_BRIDGE_V1_NATIVE';

const versions = {
  codeSha,
  baselineFsm: core.motionFsmVersionId(core.MOTION_FSM_V0_3_CANDIDATE_OPTIONS),
  candidateId: CANDIDATE_ID,
  candidateFsm: core.motionFsmVersionId(core.MOTION_FSM_V0_4_GAP_BRIDGE_OPTIONS),
  c4: core.MOTION_CORE_SPEED_C4_VERSION,
  events: core.motionEventVersionId(core.MOTION_EVENT_V0_2_CANDIDATE_OPTIONS),
  evidence: ['PR #2148 TIG22 deep validation', 'Fable independent review 2026-10-23'],
};

function fsmRowsToBySec(fsm) {
  return new Map(fsm.map((f) => [L.secOf(f.label), f]));
}

function countFsmStates(fsmBy) {
  const counts = {};
  for (const f of fsmBy.values()) counts[f.state] = (counts[f.state] ?? 0) + 1;
  return counts;
}

function countEvidenceQuality(fsmBy) {
  const counts = {};
  for (const f of fsmBy.values()) counts[f.evidenceQuality] = (counts[f.evidenceQuality] ?? 0) + 1;
  return counts;
}

function evaluateFsmTrack(d, fsmBy) {
  const claim = (sec) => L.fsmClaim(fsmBy.get(sec)?.state ?? null);
  const motion = L.motionClaimEvaluation(d.rows, claim);
  const timing = L.timingOffsets(d.runs, d.refBySec, claim, (sec) => d.gridSecs.has(sec));
  const unknownLabels = [];
  for (const [sec, f] of fsmBy) {
    if (f.state === 'UNKNOWN') unknownLabels.push(L.labelOf(sec * 1000));
  }
  return { motion, timing, unknownCount: unknownLabels.length, unknownLabels };
}

function eventsFromC4(c4) {
  return core.detectMotionManoeuvreEvents(
    0,
    c4,
    'C4_ADAPTIVE_L3',
    core.MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
    core.MOTION_EVENT_V0_2_CANDIDATE_OPTIONS,
  );
}

function eventSignature(events) {
  return events.map((e) => `${e.kind}:${e.startLabel}:${e.endLabel}:${e.peakAccel1sMps2?.toFixed(2)}`).join('|');
}

function windowFsmTable(fsmBy, startSec, endSec) {
  const rows = [];
  for (let sec = startSec; sec <= endSec; sec++) {
    const f = fsmBy.get(sec);
    if (!f) continue;
    rows.push({
      label: L.labelOf(sec * 1000),
      state: f.state,
      evidenceQuality: f.evidenceQuality,
      reason: f.reason,
      flags: (f.flags ?? []).filter((x) => x.startsWith('FSM_GAP_BRIDGE')),
    });
  }
  return rows;
}

const drives = loadAllDrives({ codeRoot, refEvalRoot, L, core, processDiV0MotionCoreShadowTrip });
const summary = { versions, drives: {}, gate: {}, failureCases: [], goNoGo: null };

let gateFail = false;
const gateReasons = [];

function stationarySupportedAux(diMap) {
  const labels = new Set();
  for (const [sec, x] of diMap) {
    if (x?.state === 'STATIONARY_SUPPORTED') labels.add(L.labelOf(sec * 1000));
  }
  return { stationarySupportedLabels: labels };
}

function runCandidateFsm(d, kinBuckets, sparse) {
  const aux = stationarySupportedAux(d.di.map);
  const labels = core.runMotionFsm(
    kinBuckets,
    d.mc.c4,
    'RETROSPECTIVE',
    sparse ?? null,
    core.MOTION_FSM_PARAMS_V0_2_DEV,
    core.MOTION_FSM_V0_4_GAP_BRIDGE_OPTIONS,
    aux,
  );
  return {
    labels: labels.map((f) => ({
      label: f.label,
      state: f.state,
      evidenceQuality: f.evidenceQuality,
      reason: f.reason,
      speedKmh: f.speedKmh,
      flags: f.flags ?? [],
    })),
    audit: labels
      .filter((f) => (f.flags ?? []).some((x) => x.startsWith('GAP_BRIDGE_V1')))
      .map((f) => ({ label: f.label, flags: f.flags, state: f.state, reason: f.reason })),
  };
}

for (const d of drives) {
  const baselineFsm = d.mc.fsm;
  const kinBuckets = withImplausibleLegEndpointsQuarantined(d.buckets);
  const candidate = runCandidateFsm(d, kinBuckets, d.sparse ?? null);
  const baselineBy = fsmRowsToBySec(baselineFsm);
  const candidateBy = fsmRowsToBySec(candidate.labels);
  const baselineEval = evaluateFsmTrack(d, baselineBy);
  const candidateEval = evaluateFsmTrack(d, candidateBy);
  const eventsBase = eventsFromC4(d.mc.c4);
  const eventsCand = eventsFromC4(d.mc.c4);
  const eventsParity = eventSignature(eventsBase) === eventSignature(eventsCand);

  const delta = {
    unknown: candidateEval.unknownCount - baselineEval.unknownCount,
    falseMotionInConfirmedStill:
      candidateEval.motion.falseMotionInConfirmedStill - baselineEval.motion.falseMotionInConfirmedStill,
    falseStillInConfirmedMotion:
      candidateEval.motion.falseStillInConfirmedMotion - baselineEval.motion.falseStillInConfirmedMotion,
    stillNoClaim: candidateEval.motion.stillNoClaim - baselineEval.motion.stillNoClaim,
    motionNoClaim: candidateEval.motion.motionNoClaim - baselineEval.motion.motionNoClaim,
    motionCorrect: candidateEval.motion.motionCorrect - baselineEval.motion.motionCorrect,
  };

  const driveOut = {
    id: d.id,
    baseline: {
      fsmStateCounts: countFsmStates(baselineBy),
      evidenceQuality: countEvidenceQuality(baselineBy),
      motion: baselineEval.motion,
      timing: baselineEval.timing,
      unknownCount: baselineEval.unknownCount,
    },
    candidate: {
      fsmStateCounts: countFsmStates(candidateBy),
      evidenceQuality: countEvidenceQuality(candidateBy),
      motion: candidateEval.motion,
      timing: candidateEval.timing,
      unknownCount: candidateEval.unknownCount,
      audit: candidate.audit,
    },
    delta,
    eventsParity,
    eventCount: eventsBase.length,
  };

  if (d.id === 'TIG22') {
    driveOut.focusWindows = {
      stop_1841: {
        baseline: windowFsmTable(baselineBy, L.secOf('2026-10-22T18:40:58Z'), L.secOf('2026-10-22T18:41:12Z')),
        candidate: windowFsmTable(candidateBy, L.secOf('2026-10-22T18:40:58Z'), L.secOf('2026-10-22T18:41:12Z')),
      },
      quarantine_1849: {
        baseline: windowFsmTable(baselineBy, L.secOf('2026-10-22T18:49:12Z'), L.secOf('2026-10-22T18:49:26Z')),
        candidate: windowFsmTable(candidateBy, L.secOf('2026-10-22T18:49:12Z'), L.secOf('2026-10-22T18:49:26Z')),
      },
    };
  }

  summary.drives[d.id] = driveOut;

  if (delta.falseMotionInConfirmedStill > 0 || delta.falseStillInConfirmedMotion > 0) {
    gateFail = true;
    gateReasons.push(`${d.id}: false claim regression`);
    summary.failureCases.push({
      drive: d.id,
      type: 'FALSE_CLAIM',
      delta,
      falseMotionLabels: candidateEval.motion.falseMotionLabels,
      falseStillLabels: candidateEval.motion.falseStillLabels,
    });
  }
  if (!eventsParity) {
    gateFail = true;
    gateReasons.push(`${d.id}: event signature changed (unexpected — C4 unchanged)`);
  }
  if (candidateEval.motion.falseMotionInConfirmedStill > 0) {
    summary.failureCases.push({
      drive: d.id,
      type: 'CANDIDATE_FALSE_MOTION_IN_STILL',
      labels: candidateEval.motion.falseMotionLabels,
    });
  }
}

summary.gate = {
  pass: !gateFail,
  reasons: gateReasons,
  rules: [
    'falseMotionInConfirmedStill must not increase on any drive',
    'falseStillInConfirmedMotion must not increase on any drive',
    'C4 event detector output unchanged (parity)',
  ],
};

const tig = summary.drives.TIG22;
const independentGain =
  tig &&
  tig.delta.unknown < 0 &&
  tig.delta.falseMotionInConfirmedStill <= 0 &&
  tig.delta.falseStillInConfirmedMotion <= 0;
const noFleetHarm = Object.values(summary.drives).every(
  (x) => x.delta.falseMotionInConfirmedStill <= 0 && x.delta.falseStillInConfirmedMotion <= 0,
);

summary.goNoGo = {
  implementation: gateFail || !noFleetHarm ? 'NO_GO' : independentGain ? 'GO_RESEARCH_IMPLEMENT' : 'NO_GO_INSUFFICIENT_GAIN',
  rationale: gateFail
    ? gateReasons.join('; ')
    : !noFleetHarm
      ? 'Fleet-wide false-claim regression'
      : independentGain
        ? 'TIG22 UNKNOWN reduced with zero false-claim regression on four drives; proceed to isolated motion-fsm implementation PR with same gates.'
        : 'Candidate did not materially reduce UNKNOWN on TIG22 without regressions.',
};

fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(
  path.join(outDir, 'comparison_table.md'),
  renderMarkdownTable(summary),
);
console.log('Wrote', outDir);
console.log('GATE', summary.gate.pass ? 'PASS' : 'FAIL', 'GO/NO-GO', summary.goNoGo.implementation);
if (!summary.gate.pass) process.exit(1);

function renderMarkdownTable(s) {
  const lines = [
    '# FSM gap-bridge research — before/after (single run)',
    '',
    `Code SHA: \`${s.versions.codeSha}\``,
    `Baseline FSM: \`${s.versions.baselineFsm}\``,
    `Candidate: \`${s.versions.candidateId}\``,
    '',
    '| Drive | UNKNOWN Δ | motionNoClaim Δ | stillNoClaim Δ | falseMotion Δ | falseStill Δ | Events parity |',
    '|-------|-----------|-----------------|----------------|---------------|--------------|---------------|',
  ];
  for (const id of ['TIG22', 'TES16', 'TES21-1', 'TES21-2']) {
    const d = s.drives[id];
    if (!d) continue;
    lines.push(
      `| ${id} | ${d.delta.unknown} | ${d.delta.motionNoClaim} | ${d.delta.stillNoClaim} | ${d.delta.falseMotionInConfirmedStill} | ${d.delta.falseStillInConfirmedMotion} | ${d.eventsParity ? 'yes' : 'NO'} |`,
    );
  }
  lines.push('', `**Gate:** ${s.gate.pass ? 'PASS' : 'FAIL'}`, `**GO/NO-GO:** ${s.goNoGo.implementation}`, '');
  if (s.failureCases.length) {
    lines.push('## Failure cases', '', '```json', JSON.stringify(s.failureCases, null, 2), '```');
  }
  return lines.join('\n');
}
