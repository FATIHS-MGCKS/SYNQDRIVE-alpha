#!/usr/bin/env node
'use strict';
/**
 * Offline event-level candidates vs. baseline (EVALUATION_RULES.md §10, §12 N3). C4 and the baseline detector
 * output are untouched; candidates only change acceptance or add an ARTEFACT_SUSPECT marking.
 *
 *   node scripts/candidates.cjs [--code-root <repo-checkout>] [--tag <label>] [--expect-sha <sha>]
 *
 * Writes outputs/<tag>/candidates.json and outputs/<tag>/CANDIDATES.md.
 */
const fs = require('node:fs');
const path = require('node:path');
const R = require('./replay_event_eval.cjs');
const E = require('./event_eval_lib.cjs');

const { loadDrives, evaluateDrive, core, GUARDS, THR, eventKey, codeSha, tag, outDir } = R;
const WINDOW_S = core.MOTION_EVENT_SPIKE_REVERSION_WINDOW_S;

const CANDIDATES = [
  {
    id: 'K-A',
    title: 'Akzeptanz nur bei Ereignisqualität OK',
    level: 'Processor-Akzeptanz (eventAcceptedCount)',
    derivedFrom: ['TIG22', 'TES21-1', 'TES16'],
    lookaheadS: 0,
    apply: (d) => ({ events: d.events, isAccepted: (e) => e.quality === 'OK' }),
  },
  {
    id: 'K-A2',
    title: 'Akzeptanz ohne DEGRADED (JITTER_SUSPECT/REPAIRED im Ereignisfenster)',
    level: 'Processor-Akzeptanz (eventAcceptedCount)',
    derivedFrom: ['TIG22', 'TES21-1', 'TES16'],
    lookaheadS: 0,
    apply: (d) => ({ events: d.events, isAccepted: (e) => e.quality === 'OK' || e.quality === 'LIMITED' }),
  },
  {
    id: 'K-B',
    title: 'K3-Erweiterung: Rückkehr auf Vor-Ereignis-Niveau (letzte nutzbare Probe vor Beginn)',
    level: 'Detektor-Option (wie spikeReversionCheck), Fenster unverändert',
    derivedFrom: ['TES16'],
    lookaheadS: WINDOW_S,
    apply: (d) => {
      const flagged = E.candidatePreBaselineReversion(d.c4, d.events, {
        usableQualities: GUARDS.usableQualities, maxGapS: GUARDS.maxGapS, windowS: WINDOW_S, minDeltaKmh: THR.minDeltaKmh, eventKey,
      });
      const events = d.events.map((e) => {
        const f = flagged.get(eventKey(e));
        if (!f) return e;
        return { ...e, quality: 'ARTEFACT_SUSPECT', flags: [...e.flags, `PRE_BASELINE_REVERSION_WITHIN_${WINDOW_S}S=${f.revert}`].sort() };
      });
      return { events, isAccepted: E.isAcceptedBaseline, extra: { flagged: [...flagged.entries()].map(([k, v]) => ({ event: k, ...v })) } };
    },
  },
  {
    id: 'K-C',
    title: 'Fahrzeugklassen-Plausibilitätsschranke (§8) → nicht akzeptiert',
    level: 'Processor-Akzeptanz (benötigt Fahrzeugklasse)',
    derivedFrom: ['TIG22'],
    lookaheadS: 0,
    apply: (d) => ({
      events: d.events,
      isAccepted: (e) => E.isAcceptedBaseline(e) && !E.plausibility(e, d.identity.vehicleClass, null).implausible,
    }),
  },
];

function hardMissed(acc) { return acc.oracleHardMissed; }
function borderlineMissed(acc) { return acc.oracleBorderlineMissed; }
function hits(acc) { return acc.ds4ByClass.TREFFER ?? 0; }
function fragments(acc) { return acc.ds4ByClass.TREFFER_FRAGMENT ?? 0; }
function hardFalse(acc) { return acc.ds4ByClass.FEHLALARM ?? 0; }
function softFalse(acc) { return (acc.ds4ByClass.WEICHER_FEHLALARM ?? 0) + (acc.ds4ByClass.FEHLALARM_INTENSITAET ?? 0); }

function criteria(baseline, cand, drives) {
  const perDrive = drives.map((d) => {
    const b = baseline[d.id].summary.accepted;
    const c = cand[d.id].summary.accepted;
    return {
      id: d.id, role: d.identity.role,
      hardFalse: [hardFalse(b), hardFalse(c)], softFalse: [softFalse(b), softFalse(c)], hits: [hits(b), hits(c)], fragments: [fragments(b), fragments(c)],
      hardMissed: [hardMissed(b), hardMissed(c)], borderlineMissed: [borderlineMissed(b), borderlineMissed(c)],
      startMedian: [b.offsets.start.medianS, c.offsets.start.medianS], endMedian: [b.offsets.end.medianS, c.offsets.end.medianS],
      acceptedEvents: [b.events, c.events],
    };
  });
  const evalDrives = perDrive.filter((p) => p.role === 'EVAL');
  const c1 = evalDrives.some((p) => p.hardFalse[1] < p.hardFalse[0]) && perDrive.every((p) => p.hardFalse[1] <= p.hardFalse[0]);
  const c2 = perDrive.every((p) => p.hardMissed[1] <= p.hardMissed[0] && p.borderlineMissed[1] - p.borderlineMissed[0] <= 1);
  const c3 = perDrive.every((p) => p.hits[1] >= p.hits[0] && p.fragments[1] <= p.fragments[0]);
  const med = (x) => (x == null ? 0 : x);
  const c4 = perDrive.every((p) => Math.abs(med(p.startMedian[1]) - med(p.startMedian[0])) <= 1 && Math.abs(med(p.endMedian[1]) - med(p.endMedian[0])) <= 1);
  return { perDrive, c1_hardFalseDownOnEval_noIncrease: c1, c2_noNewHardMiss_borderlineLe1: c2, c3_hitsKept_noMoreFragments: c3, c4_medianOffsetsStable: c4 };
}

function main() {
  const drives = loadDrives();
  const baseline = {};
  for (const d of drives) baseline[d.id] = evaluateDrive(d, { write: false });

  const report = [];
  const out = { schema: 'DS4_ACCEL_BRAKE_EVENT_CANDIDATES_V1', codeSha, tag, generatedAtUtc: new Date().toISOString(), spikeReversionWindowS: WINDOW_S, candidates: [] };

  for (const cand of CANDIDATES) {
    const res = {};
    const extras = {};
    for (const d of drives) {
      const applied = cand.apply(d);
      // parity: same C4, same event set (only quality/acceptance may differ)
      const baseKeys = d.events.map(eventKey).join('\n');
      const candKeys = applied.events.map(eventKey).join('\n');
      if (baseKeys !== candKeys) throw new Error(`candidate ${cand.id} changed the event set on ${d.id}`);
      res[d.id] = evaluateDrive(d, { events: applied.events, isAccepted: applied.isAccepted, write: false });
      if (applied.extra) extras[d.id] = applied.extra;
    }
    const crit = criteria(baseline, res, drives);
    const c5 = cand.lookaheadS <= WINDOW_S;
    const independent = drives.filter((d) => !cand.derivedFrom.includes(d.id)).map((d) => d.id);
    const evalIndependent = drives.filter((d) => d.identity.role === 'EVAL' && !cand.derivedFrom.includes(d.id)).map((d) => d.id);
    const c1Independent = crit.perDrive.some((p) => evalIndependent.includes(p.id) && p.hardFalse[1] < p.hardFalse[0]);
    const verdict = crit.c1_hardFalseDownOnEval_noIncrease && c1Independent && crit.c2_noNewHardMiss_borderlineLe1 && crit.c3_hitsKept_noMoreFragments && crit.c4_medianOffsetsStable && c5 ? 'PROVEN' : 'NOT_PROVEN';
    // de-accepted / newly accepted events relative to the baseline, with their baseline class
    const changed = [];
    for (const d of drives) {
      const bAcc = new Map(baseline[d.id].events.map((r) => [`${r.kind}|${r.start_utc}|${r.end_utc}`, r]));
      for (const r of res[d.id].events) {
        const k = `${r.kind}|${r.start_utc}|${r.end_utc}`;
        const b = bAcc.get(k);
        if (b && b.accepted !== r.accepted) changed.push({ drive: d.id, event: `${r.kind} ${r.start_utc.slice(11, 19)}–${r.end_utc.slice(11, 19)} (${r.start_utc.slice(0, 10)})`, speeds: `${r.start_kmh}->${r.end_kmh}`, quality: r.quality, baselineClass: b.cls, note: b.note, accepted: [b.accepted, r.accepted], implausible: b.implausible, artefactSuspectView: b.artefact_suspect_view, nearBoundary: b.near_boundary });
      }
    }
    const entry = { ...cand, apply: undefined, criteria: crit, c5_noExtraLookahead: c5, independentDrives: independent, c1OnIndependentEval: c1Independent, verdict, changedAcceptance: changed, extras };
    out.candidates.push(entry);

    report.push(`## ${cand.id} — ${cand.title}`);
    report.push('');
    report.push(`Ebene: ${cand.level}. Abgeleitet aus: ${cand.derivedFrom.join(', ')}. Unabhängige Fahrten: ${independent.join(', ') || '—'}. Vorausschau: ${cand.lookaheadS} s.`);
    report.push('');
    report.push('| Fahrt | Rolle | akzeptiert B→K | harte FA B→K | weiche/Intens. FA B→K | TREFFER B→K | Fragmente B→K | VERPASST hart B→K | VERPASST grenzw. B→K | Median Beginn B→K | Median Ende B→K |');
    report.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const p of crit.perDrive) {
      const pair = (x) => `${x[0]}→${x[1]}`;
      report.push(`| ${p.id} | ${p.role} | ${pair(p.acceptedEvents)} | ${pair(p.hardFalse)} | ${pair(p.softFalse)} | ${pair(p.hits)} | ${pair(p.fragments)} | ${pair(p.hardMissed)} | ${pair(p.borderlineMissed)} | ${pair(p.startMedian.map((x) => x ?? '–'))} | ${pair(p.endMedian.map((x) => x ?? '–'))} |`);
    }
    report.push('');
    report.push(`Kriterien §10: 1 (harte FA ↓ auf EVAL, nirgends ↑): ${crit.c1_hardFalseDownOnEval_noIncrease ? 'erfüllt' : 'nicht erfüllt'}; 1 auf unabhängiger EVAL-Fahrt: ${c1Independent ? 'erfüllt' : 'nicht erfüllt'}; 2: ${crit.c2_noNewHardMiss_borderlineLe1 ? 'erfüllt' : 'nicht erfüllt'}; 3: ${crit.c3_hitsKept_noMoreFragments ? 'erfüllt' : 'nicht erfüllt'}; 4: ${crit.c4_medianOffsetsStable ? 'erfüllt' : 'nicht erfüllt'}; 5: ${c5 ? 'erfüllt' : 'nicht erfüllt'}; 7: erfüllt (C4/Ereignismenge unverändert, Paritäts-Assert). **Ergebnis: ${verdict}.**`);
    report.push('');
    if (changed.length) {
      report.push('Geänderte Akzeptanz gegenüber Baseline (Klasse = Baseline-Klassifikation, §5):');
      report.push('');
      report.push('| Fahrt | Ereignis | km/h | Qualität (K) | Baseline-Klasse | Hinweis | unplausibel | Artefaktsicht | Grenznähe |');
      report.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
      for (const c of changed) report.push(`| ${c.drive} | ${c.event} | ${c.speeds} | ${c.quality} | ${c.baselineClass} | ${(c.note || []).join(' ')} | ${c.implausible} | ${c.artefactSuspectView} | ${c.nearBoundary} |`);
      report.push('');
    } else {
      report.push('Keine Akzeptanzänderung gegenüber Baseline.');
      report.push('');
    }
  }

  fs.writeFileSync(path.join(outDir, 'candidates.json'), JSON.stringify(out, null, 2) + '\n');
  const head = [
    '# Offline-Kandidaten (Ereignisebene) — Vergleich gegen Baseline',
    '',
    `Code \`${tag}\` @ \`${codeSha}\`. Baseline = Akzeptanzsicht §12 N3 (alles außer \`ARTEFACT_SUSPECT\`). B = Baseline, K = Kandidat. Klassen nach §5/§12; VERPASST-Zähler aus dem Orakelstatus der akzeptierten Teilmenge.`,
    '',
    'Kein Kandidat verändert C4, Schwellen, Guards oder die Ereignismenge; geprüft wird ausschließlich Akzeptanz bzw. `ARTEFACT_SUSPECT`-Markierung (§10 Kriterium 7, Paritäts-Assert im Skript).',
    '',
  ];
  fs.writeFileSync(path.join(outDir, 'CANDIDATES.md'), head.concat(report).join('\n'));
  for (const c of out.candidates) console.log(c.id, c.verdict, JSON.stringify(c.criteria.perDrive.map((p) => [p.id, p.acceptedEvents, p.hardFalse, p.hits, p.hardMissed])));
  console.log(`written: ${path.relative(R.thisRepo, outDir)}/CANDIDATES.md`);
}

main();
