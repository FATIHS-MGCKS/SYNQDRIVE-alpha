#!/usr/bin/env node
/**
 * DS4 Motion — offline event-display gating candidates (NOT runtime-integrated).
 *
 * Reproduces the frozen baseline (C4 → events) from the compact audit package, then evaluates
 * pure post-filters that would only change *how an event is labelled in the UI*
 * (UNCERTAIN vs. shown as-is). Event detection itself is left untouched.
 *
 * Run with Node ≥ 24 (TypeScript type stripping) from this directory:
 *   /usr/bin/node --import ../ds4-motion-tiguan-20261022-compact/DS4_Motion_Tiguan_CURSOR_COMPACT/loader.mjs ./event_display_candidates.mjs
 *
 * Outputs: analysis/event_display_candidates.json + .md
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import researchGates from './event_quality_research.cjs';
const { evaluateGates, ENVELOPE } = researchGates;

const here = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(here, '../ds4-motion-tiguan-20261022-compact/DS4_Motion_Tiguan_CURSOR_COMPACT');
const BACKEND = path.join(PKG, 'backend/src/modules/vehicle-intelligence/driving-intelligence/core/kinematics');
const { computeC4AdaptiveL3 } = await import(path.join(BACKEND, 'c4-adaptive-l3.ts'));
const { detectMotionManoeuvreEvents, MOTION_CORE_EVENT_GUARDS_V0_1_DEV, MOTION_EVENT_V0_2_CANDIDATE_OPTIONS } =
  await import(path.join(BACKEND, 'motion-event-detector.ts'));

const read = (rel) => JSON.parse(fs.readFileSync(path.join(PKG, rel), 'utf8'));
const grid22 = read('evaluation/snapshots/position_grid_verified.json');
const persisted = read('evaluation/snapshots/di_v0_motion_core_shadow_payload.json');
const grid19 = read('evaluation/snapshots/TIGUAN_20261019_POSITION_GRID.json').buckets.map(
  ({ bucketLabelUtc, availability, latitude, longitude }) => ({ bucketLabelUtc, availability, latitude, longitude }),
);
const windowsCsv = fs.readFileSync(path.join(PKG, 'evaluation/reference/TIGUAN_2026-10-22_analysis_windows.csv'), 'utf8');
const provenance = read('evaluation/PROVENANCE_MANIFEST.json');
const VIDEO = provenance.trip_identity.video_reference_window_utc;

const toSec = (label) => Date.parse(label) / 1000;

const t0 = process.hrtime.bigint();
const mem0 = process.memoryUsage().heapUsed;

/* ---------- frozen baseline ---------- */
const runPipeline = (grid) => {
  const c4 = computeC4AdaptiveL3(grid);
  const events = detectMotionManoeuvreEvents(
    0,
    c4,
    'C4_ADAPTIVE_L3',
    MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
    MOTION_EVENT_V0_2_CANDIDATE_OPTIONS,
  );
  return { c4, events };
};
const base22 = runPipeline(grid22);
assert.equal(base22.events.length, persisted.events.length, 'event count must reproduce');
base22.events.forEach((ev, i) => {
  const p = persisted.events[i];
  for (const k of ['kind', 'startLabel', 'endLabel', 'startSpeedKmh', 'endSpeedKmh', 'deltaKmh', 'quality']) {
    assert.deepEqual(ev[k], p[k], `event ${i} field ${k}`);
  }
});
const base19 = runPipeline(grid19);

/* ---------- candidate gates (pure, display-level) ---------- */
/* ---------- reference windows (video) ---------- */
const refWindows = windowsCsv
  .trim()
  .split('\n')
  .slice(1)
  .map((line, i) => {
    const c = line.split(',');
    return {
      id: i + 1,
      direction: c[0] === 'SPEED_INCREASE' ? 'ACCELERATION' : 'DECELERATION',
      startUtc: new Date(c[4]).toISOString().replace('.000Z', 'Z'),
      endUtc: new Date(c[5]).toISOString().replace('.000Z', 'Z'),
      refStartKmh: Number(c[6]),
      refEndKmh: Number(c[7]),
      refMeanAccelMps2: Number(c[9]),
    };
  });
const overlaps = (ev, w) => ev.startLabel <= w.endUtc && ev.endLabel >= w.startUtc;

const gated22 = evaluateGates(base22.events, base22.c4, grid22);
const windowMatches = refWindows.map((w) => {
  const matched = base22.events
    .map((ev, i) => ({ ev, i }))
    .filter(({ ev }) => ev.kind === w.direction && overlaps(ev, w));
  return {
    ...w,
    matchedEventIndexes: matched.map((m) => m.i),
    matchedFlaggedByKE: matched.filter((m) => gated22[m.i].K_E_combined_uncertain).map((m) => m.i),
    matchedFlaggedByKE3: matched.filter((m) => gated22[m.i].K_E3_uncertain).map((m) => m.i),
  };
});

const inVideo = (ev) => ev.startLabel >= VIDEO.first && ev.endLabel <= VIDEO.last;
const summary22 = {
  totalEvents: base22.events.length,
  videoCoveredEvents: base22.events.filter(inVideo).length,
  referenceWindowsMatched: windowMatches.filter((w) => w.matchedEventIndexes.length > 0).length,
  referenceWindowsTotal: refWindows.length,
  K_E: {
    flaggedTotal: gated22.filter((g) => g.K_E_combined_uncertain).length,
    flaggedInVideo: gated22.filter((g, i) => g.K_E_combined_uncertain && inVideo(base22.events[i])).length,
    flaggedOutsideVideo: gated22.filter((g, i) => g.K_E_combined_uncertain && !inVideo(base22.events[i])).length,
    referenceMatchedEventsFlagged: windowMatches.flatMap((w) => w.matchedFlaggedByKE).length,
    flaggedIndexes: gated22.filter((g) => g.K_E_combined_uncertain).map((g) => g.index),
  },
  K_E3: {
    flaggedTotal: gated22.filter((g) => g.K_E3_uncertain).length,
    referenceMatchedEventsFlagged: windowMatches.flatMap((w) => w.matchedFlaggedByKE3).length,
    flaggedIndexes: gated22.filter((g) => g.K_E3_uncertain).map((g) => g.index),
  },
};

const gated19 = evaluateGates(base19.events, base19.c4, grid19);
const summary19 = {
  totalEvents: base19.events.length,
  K_E_flagged: gated19.filter((g) => g.K_E_combined_uncertain).map((g) => `${g.index}:${g.start.slice(11, 19)}`),
  K_E3_flagged: gated19.filter((g) => g.K_E3_uncertain).map((g) => `${g.index}:${g.start.slice(11, 19)}`),
};

/* ---------- robustness invariants on the frozen pipeline ---------- */
const robustness = [];
{
  const allAbsent = grid22.map((g) => ({ ...g, availability: 'ROW_ABSENT', latitude: null, longitude: null }));
  const r = runPipeline(allAbsent);
  robustness.push({ check: 'data_loss_yields_no_events', pass: r.events.length === 0, detail: `events=${r.events.length}` });
}
{
  // Horizon stability: events that end ≥ 10 s before a truncation point must be identical when the
  // grid is truncated there (retrospective detector must not depend on far-future data).
  const cut = '2026-10-22T19:00:30Z';
  const truncated = grid22.filter((g) => g.bucketLabelUtc <= cut);
  const r = runPipeline(truncated);
  const stableFull = base22.events.filter((e) => toSec(e.endLabel) <= toSec(cut) - 10);
  const stableTrunc = r.events.filter((e) => toSec(e.endLabel) <= toSec(cut) - 10);
  const same = JSON.stringify(stableFull.map((e) => [e.startLabel, e.endLabel, e.deltaKmh])) ===
    JSON.stringify(stableTrunc.map((e) => [e.startLabel, e.endLabel, e.deltaKmh]));
  robustness.push({ check: 'horizon_stability_10s', pass: same, detail: `full=${stableFull.length} truncated=${stableTrunc.length}` });
}
{
  const a = runPipeline(grid22);
  const b = runPipeline(grid22);
  robustness.push({ check: 'idempotent_rerun', pass: JSON.stringify(a.events) === JSON.stringify(b.events), detail: '' });
}
{
  const gatesA = JSON.stringify(evaluateGates(base22.events, base22.c4, grid22));
  const gatesB = JSON.stringify(evaluateGates(base22.events, base22.c4, grid22));
  robustness.push({ check: 'gates_deterministic', pass: gatesA === gatesB, detail: '' });
}

const t1 = process.hrtime.bigint();
const mem1 = process.memoryUsage();
const runtime = {
  wallMs: Number(t1 - t0) / 1e6,
  heapUsedDeltaMb: Math.round(((mem1.heapUsed - mem0) / 1048576) * 100) / 100,
  rssMb: Math.round((mem1.rss / 1048576) * 10) / 10,
  node: process.version,
};

const out = {
  schema: 'DS4_MOTION_EVENT_DISPLAY_CANDIDATES_V1',
  status: 'HISTORICAL_FROZEN_BASELINE_ONLY_SEE_HARDENED_COMPARISON',
  generatedAtUtc: new Date().toISOString(),
  frozenBaseline: {
    algorithmVersions: persisted.contract.algorithmVersions,
    reproduced: true,
    tiguan22: { labels: grid22.length, events: base22.events.length },
    tiguan19: { labels: grid19.length, events: base19.events.length },
  },
  gates: {
    G1_envelope: ENVELOPE,
    G2_timingSupport: 'JITTER_SUSPECT in window OR (label gap in window AND both endpoints sparse-support)',
    G3_chord: 'C4 endpoint speed deviates from positioned-leg chord speed by > max(20 km/h, 50 %)',
    K_E: 'G1 ∪ G2 (experimental hypothesis; not customer classification)',
    K_E3: 'G1 ∪ G2 ∪ G3 (aggressive; evaluated for comparison only)',
  },
  tiguan22: { summary: summary22, events: gated22, referenceWindows: windowMatches },
  tiguan19: { summary: summary19, events: gated19 },
  robustness,
  runtime,
};
fs.mkdirSync(path.join(here, 'analysis'), { recursive: true });
fs.writeFileSync(path.join(here, 'analysis/event_display_candidates.json'), JSON.stringify(out, null, 2));

const md = [];
md.push('# Event-Display-Kandidaten (offline, nicht integriert)\n');
md.push(`Baseline reproduziert: Tiguan-22 ${base22.events.length} Events / Tiguan-19 ${base19.events.length} Events · Node ${runtime.node} · ${runtime.wallMs.toFixed(0)} ms · Heap Δ ${runtime.heapUsedDeltaMb} MB · RSS ${runtime.rssMb} MB\n`);
md.push('| Kandidat | Tiguan-22 geflaggt (gesamt) | davon im Video | davon außerhalb | referenz-gematchte Events geflaggt | Tiguan-19 geflaggt |');
md.push('|---|---|---|---|---|---|');
md.push(`| K-E (G1 ∪ G2) | ${summary22.K_E.flaggedTotal}/21 → #${summary22.K_E.flaggedIndexes.join(', #')} | ${summary22.K_E.flaggedInVideo} | ${summary22.K_E.flaggedOutsideVideo} | ${summary22.K_E.referenceMatchedEventsFlagged}/${windowMatches.flatMap((w) => w.matchedEventIndexes).length} | ${summary19.K_E_flagged.length}/${summary19.totalEvents} ${summary19.K_E_flagged.join(' ')} |`);
md.push(`| K-E3 (+G3) | ${summary22.K_E3.flaggedTotal}/21 → #${summary22.K_E3.flaggedIndexes.join(', #')} | — | — | ${summary22.K_E3.referenceMatchedEventsFlagged}/${windowMatches.flatMap((w) => w.matchedEventIndexes).length} | ${summary19.K_E3_flagged.length}/${summary19.totalEvents} ${summary19.K_E3_flagged.join(' ')} |`);
md.push('');
md.push('## Tiguan-22 Events\n');
md.push('| # | Art | UTC | km/h | Qualität | G1 | G2 | G3 | K-E |');
md.push('|---|---|---|---|---|---|---|---|---|');
for (const g of gated22) {
  md.push(`| ${g.index} | ${g.kind.slice(0, 5)} | ${g.start.slice(11, 19)}–${g.end.slice(11, 19)} | ${g.startSpeedKmh}→${g.endSpeedKmh} | ${g.quality} | ${g.G1_envelope.join('; ') || ''} | ${g.G2_timingSupport.join('; ') || ''} | ${g.G3_chord.join('; ') || ''} | ${g.K_E_combined_uncertain ? '**UNSICHER**' : ''} |`);
}
md.push('');
md.push('## Referenzfenster (Video) — Erhaltung\n');
md.push('| Fenster | Richtung | UTC | Referenz km/h | gematchte Events | durch K-E geflaggt |');
md.push('|---|---|---|---|---|---|');
for (const w of windowMatches) {
  md.push(`| ${w.id} | ${w.direction.slice(0, 5)} | ${w.startUtc.slice(11, 19)}–${w.endUtc.slice(11, 19)} | ${w.refStartKmh}→${w.refEndKmh} | ${w.matchedEventIndexes.length ? '#' + w.matchedEventIndexes.join(', #') : '— (kein Event)'} | ${w.matchedFlaggedByKE.length ? '#' + w.matchedFlaggedByKE.join(', #') : 'keins'} |`);
}
md.push('');
md.push('## Robustheit (eingefrorene Pipeline)\n');
for (const r of robustness) md.push(`- ${r.check}: ${r.pass ? 'PASS' : 'FAIL'} ${r.detail}`);
fs.writeFileSync(path.join(here, 'analysis/event_display_candidates.md'), md.join('\n') + '\n');
console.log(md.join('\n'));
