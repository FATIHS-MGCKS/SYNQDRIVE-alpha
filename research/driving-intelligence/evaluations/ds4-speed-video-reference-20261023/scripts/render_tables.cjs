#!/usr/bin/env node
'use strict';
/**
 * Renders the Markdown tables used in REPORT.md from outputs/<tag>/summary.json (no recomputation).
 *
 *   node scripts/render_tables.cjs [--tags main,pr2134] > outputs/TABLES.md
 */
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const tags = opt('--tags', 'main,pr2134').split(',');
const outDir = path.resolve(__dirname, '..', 'outputs');
const S = Object.fromEntries(tags.map((t) => [t, JSON.parse(fs.readFileSync(path.join(outDir, t, 'summary.json'), 'utf8'))]));
const f = (x, d = 2) => (x == null || Number.isNaN(x) ? '–' : Number(x).toFixed(d));
const pct = (x) => (x == null ? '–' : `${(100 * x).toFixed(1)} %`);
const row = (cells) => `| ${cells.join(' | ')} |`;
const out = [];
const h = (cols) => { out.push(row(cols)); out.push(row(cols.map(() => '---'))); };

const SERIES = ['stored_l3', 'replay_l3', 'replay_l3_qc', 'stored_c4', 'replay_c4', 'obd'];
const NAME = { stored_l3: 'L3 gespeichert', replay_l3: 'L3 Replay', replay_l3_qc: 'L3 Replay nach Speed-QC V2', stored_c4: 'C4 gespeichert', replay_c4: 'C4 Replay', obd: 'OBD (R1, Vergleichsquelle)' };

for (const tag of tags) {
  const s = S[tag];
  out.push(`\n### Geschwindigkeit je Fahrt — Code \`${tag}\` @ \`${s.versions.codeSha.slice(0, 9)}\` (Versatz 0 s, exakte Sekunde)\n`);
  h(['Fahrt', 'Pfad', 'n gepaart / lesbar', 'Abdeckung', 'MAE', 'Median abs. Fehler', 'P95 abs. Fehler', 'max abs. Fehler', 'Bias', 'Anteil abs. Fehler ≤ 5']);
  for (const d of s.drives) for (const k of SERIES) {
    const m = d.speed[k]; if (!m) continue;
    out.push(row([d.id, NAME[k], `${m.all.n} / ${m.coverage.readable}`, pct(m.coverage.pairedShareOfReadable), f(m.all.maeKmh), f(m.all.medianAbsKmh), f(m.all.p95AbsKmh), f(m.all.maxAbsKmh, 1), f(m.all.biasKmh), pct(m.all.within5)]));
  }
  out.push(`\n### Gepoolt — Code \`${tag}\`\n`);
  h(['Pool', 'Pfad', 'n', 'MAE', 'Median abs. Fehler', 'P95 abs. Fehler', 'max abs. Fehler', 'Bias', 'Anteil abs. Fehler ≤ 5']);
  for (const [pool, obj] of Object.entries(s.overall)) if (pool !== 'roles') for (const [k, m] of Object.entries(obj)) out.push(row([pool, NAME[k] ?? k, m.n, f(m.maeKmh), f(m.medianAbsKmh), f(m.p95AbsKmh), f(m.maxAbsKmh, 1), f(m.biasKmh), pct(m.within5)]));

  out.push(`\n### Physikalisch unplausible Schätzwerte (> ${s.versions.implausibleViewThresholdKmh} km/h) — getrennte Sicht, Code \`${tag}\`\n`);
  h(['Fahrt', 'Pfad', 'Sekunden > Schwelle', 'MAE ohne', 'P95 ohne', 'max ohne', 'Labels (UTC)']);
  for (const d of s.drives) for (const [k, v] of Object.entries(d.implausibleEstimates)) if (k !== 'thresholdKmh' && v.count) out.push(row([d.id, NAME[k] ?? k, v.count, f(v.metricsExcludingImplausible.maeKmh), f(v.metricsExcludingImplausible.p95AbsKmh), f(v.metricsExcludingImplausible.maxAbsKmh, 1), v.hits.map((x) => x.label.slice(11, 19)).join(', ')]));

  out.push(`\n### Stillstand / Bewegung (Referenzkern) — Code \`${tag}\`\n`);
  h(['Fahrt', 'Pfad', 'Stillstand-Kern (s)', 'falsche Bewegung', 'kein Anspruch (still)', 'bestätigte Bewegung (s)', 'falscher Stillstand', 'kein Anspruch (bewegt)']);
  for (const d of s.drives) for (const [k, m] of Object.entries(d.motion)) out.push(row([d.id, k, m.confirmedStillCoreSecs, m.falseMotionInConfirmedStill, m.stillNoClaim, m.confirmedMotionSecs, m.falseStillInConfirmedMotion, m.motionNoClaim]));

  out.push(`\n### Zeitversatz Anhalten / Anfahren (DS4 − Referenz, s; positiv = spät) — Code \`${tag}\`\n`);
  h(['Fahrt', 'Pfad', 'Halte gefunden', 'Halt-Versätze', 'Median Halt', 'Anfahrten gefunden', 'Anfahr-Versätze', 'Median Anfahrt']);
  for (const d of s.drives) for (const [k, t] of Object.entries(d.timing)) out.push(row([d.id, k, `${t.stop.found}/${t.stop.evaluated}`, t.stop.offsets.join(', ') || '–', t.stop.medianOffsetS ?? '–', `${t.start.found}/${t.start.evaluated}`, t.start.offsets.join(', ') || '–', t.start.medianOffsetS ?? '–']));

  out.push(`\n### Sensitivität der Zeitzuordnung (C4 Replay; DS4-Lookup um k s verschoben; nur Einordnung) — Code \`${tag}\`\n`);
  h(['Fahrt', 'k = −2', 'k = −1', 'k = 0 (maßgeblich)', 'k = +1', 'k = +2']);
  for (const d of s.drives) out.push(row([d.id, ...['shift_-2', 'shift_-1', 'shift_0', 'shift_1', 'shift_2'].map((k) => `${f(d.sensitivity[k].replay_c4.maeKmh)} / ${f(d.sensitivity[k].replay_c4.p95AbsKmh)}`)]));
  out.push('\nZellen: MAE / P95 in km/h.');

  out.push(`\n### Segmente (C4 Replay) — Code \`${tag}\`\n`);
  h(['Fahrt', 'Band', 'n', 'MAE', 'P95 abs. Fehler', 'Bias']);
  for (const d of s.drives) for (const [b, m] of Object.entries(d.speed.replay_c4.bands)) if (m.n) out.push(row([d.id, b, m.n, f(m.maeKmh), f(m.p95AbsKmh), f(m.biasKmh)]));
  for (const d of s.drives) for (const [b, m] of Object.entries(d.speed.replay_c4.phases)) if (m.n) out.push(row([d.id, `Phase ${b}`, m.n, f(m.maeKmh), f(m.p95AbsKmh), f(m.biasKmh)]));

  out.push(`\n### Dünne GPS-Stützung (C4 Replay, abs. Fehler nach Qualität / Nachbarschaftsmuster t−1 t t+1) — Code \`${tag}\`\n`);
  h(['Fahrt', 'Gruppe', 'n', 'MAE', 'P95 abs. Fehler', 'max abs. Fehler']);
  for (const d of s.drives) {
    for (const [g, m] of Object.entries(d.sparsePosition.replay_c4.byC4Quality)) out.push(row([d.id, `Qualität ${g}`, m.n, f(m.maeKmh), f(m.p95AbsKmh), f(m.maxAbsKmh, 1)]));
    for (const [g, m] of Object.entries(d.sparsePosition.replay_c4.byPattern)) out.push(row([d.id, `Muster ${g}`, m.n, f(m.maeKmh), f(m.p95AbsKmh), f(m.maxAbsKmh, 1)]));
  }

  out.push(`\n### Speed-QC (Produktpfad, ${S[tag].drives[0].speedQc.policy}) auf lesbaren Referenzsekunden — Code \`${tag}\`\n`);
  h(['Fahrt', 'TRUSTED', 'TRUSTED_LIMITED', 'UNTRUSTED', 'davon mit numerischem L3', 'Gründe (UNTRUSTED/LIMITED)']);
  for (const d of s.drives) { const q = d.speedQc; out.push(row([d.id, q.trustLevels.TRUSTED ?? 0, q.trustLevels.TRUSTED_LIMITED ?? 0, q.trustLevels.UNTRUSTED ?? 0, q.untrustedWithNumericL3, Object.entries(q.reasonCodes).filter(([c]) => c !== 'OK').map(([c, n]) => `${c} ${n}`).join(', ')])); }

  out.push(`\n### Gespeichert vs. Replay (Versionsdrift) und Ereignis-Vorzeichenprüfung — Code \`${tag}\`\n`);
  h(['Fahrt', 'L3 beide numerisch', 'L3 gleich (±0,05)', 'L3 nur gespeichert / nur Replay', 'C4 beide numerisch', 'C4 gleich', 'C4 nur gespeichert / nur Replay', 'Ereignisse Replay / gespeichert', 'deltaKmh ≥ 0', 'deltaKmh = kind-signiert'],);
  for (const d of s.drives) { const l = d.storedVsReplayDrift.l3, c = d.storedVsReplayDrift.c4; out.push(row([d.id, l.bothNumeric, l.equalWithin005, `${l.storedOnly} / ${l.replayOnly}`, c ? c.bothNumeric : '–', c ? c.equalWithin005 : '–', c ? `${c.storedOnly} / ${c.replayOnly}` : '–', `${d.events.replay.count} / ${d.events.stored?.count ?? '–'}`, `${d.events.replay.deltaNonNegative}/${d.events.replay.count}`, `${d.events.replay.deltaEqualsKindSignedDiff}/${d.events.replay.count}`])); }
}

const candFile = path.join(outDir, 'candidate_pr2134_vs_main.json');
if (fs.existsSync(candFile)) {
  const c = JSON.parse(fs.readFileSync(candFile, 'utf8'));
  out.push(`\n### Kandidat #2134 (\`${c.candidate.codeSha.slice(0, 9)}\`) gegen Baseline main (\`${c.baseline.codeSha.slice(0, 9)}\`) — gemeinsame Sekunden, Serie \`${c.series}\`\n`);
  h(['Fahrt', 'Rolle', 'n gemeinsam', 'MAE Baseline → Kandidat', 'P95 Baseline → Kandidat', 'max Baseline → Kandidat', 'gepaart Baseline → Kandidat', 'zurückgehalten (unplausibel / plausibel)', 'FSM falsche Bewegung', 'FSM Anfahrt-Median', 'Ereignisse']);
  for (const [id, x] of Object.entries(c.perDrive)) {
    const cs = x.commonSupport, fsm = x.motionAndTiming.replay_fsm;
    out.push(row([id, `${x.role.evalDrive ? 'EVAL' : 'DEV'}${x.role.candidateDerivedHere ? ' (Kandidat hier abgeleitet)' : ''}`, cs.n, `${f(cs.baseline.maeKmh)} → ${f(cs.candidate.maeKmh)}`, `${f(cs.baseline.p95AbsKmh)} → ${f(cs.candidate.p95AbsKmh)}`, `${f(cs.baseline.maxAbsKmh, 1)} → ${f(cs.candidate.maxAbsKmh, 1)}`, `${x.coverage.baselinePaired} → ${x.coverage.candidatePaired}`, `${x.coverage.withheldImplausible} / ${x.coverage.withheldPlausible}`, fsm ? fsm.falseMotion.join(' → ') : '–', fsm ? fsm.startMedianOffsetS.join(' → ') : '–', x.events.count.join(' → ')]));
  }
}
process.stdout.write(out.join('\n') + '\n');
