#!/usr/bin/env node
'use strict';
/**
 * Render outputs/<tag>/*.csv + summary.json into outputs/<tag>/TABLES.md (manoeuvre tables, event tables,
 * operator windows, pooled metrics). Pure formatting; no evaluation logic.
 *
 *   node scripts/render_tables.cjs [--tag <label>]
 */
const fs = require('node:fs');
const path = require('node:path');
const L = require('../../ds4-speed-video-reference-20261023/scripts/eval_lib.cjs');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const tag = opt('--tag', 'main');
const outDir = path.resolve(__dirname, '..', 'outputs', tag);
const summary = JSON.parse(fs.readFileSync(path.join(outDir, 'summary.json'), 'utf8'));
const csv = (name) => { const p = path.join(outDir, name); return fs.existsSync(p) ? L.parseCsv(fs.readFileSync(p, 'utf8')) : []; };

const hms = (utc) => (utc ? utc.slice(11, 19) : '');
const day = (utc) => (utc ? utc.slice(0, 10) : '');
const k = (kind) => (kind === 'ACCELERATION' ? 'BESCHL' : 'BREMS');
const v = (x) => (x === '' || x == null ? '–' : x);
const yn = (x) => (x === '1' || x === 1 || x === true ? 'ja' : x === '0' || x === 0 || x === false ? 'nein' : '–');
const fmtOff = (x) => (x === '' || x == null ? '–' : (Number(x) > 0 ? `+${x}` : `${x}`));
const table = (header, rows) => [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map((c) => String(c ?? '').replace(/\|/g, '/')).join(' | ')} |`), ''];
const cnt = (obj, key) => (obj && obj[key]) || 0;

const out = [];
out.push(`# Tabellen — DS4 Beschleunigen/Bremsen vs. Videoreferenz`);
out.push('');
out.push(`Code \`${summary.versions.tag}\` @ \`${summary.versions.codeSha}\`; Detektorversion \`${summary.versions.events}\`; C4 \`${summary.versions.c4}\`. Generiert ${summary.generatedAtUtc}. Regeln: \`EVALUATION_RULES.md\` (inkl. §12 N1–N3). Alle Zeiten UTC, Referenz = Video-Tacho (1 Hz, ±1 s Ablesung, Uhrenversatz nicht validiert).`);
out.push('');

// ---------- overview ----------
out.push('## 1. Fahrten');
out.push('');
out.push(...table(
  ['Fahrt', 'Rolle', 'Fahrzeugklasse', 'Quelle', 'Referenzfenster (UTC)', 'lesbare s', 'C4 numerisch / nutzbar', 'Detektorsegmente', 'Quarantäne-s', 'DS4-Ereignisse (im Fenster)', 'akzeptiert', 'Orakel-Manöver', 'sichtbare Läufe'],
  summary.drives.map((d) => {
    const c = d.summary.coverage;
    return [d.id, d.identity.role, d.identity.vehicleClass, d.identity.sourceFamily, `${hms(c.referenceWindowUtc[0])}–${hms(c.referenceWindowUtc[1])} (${day(c.referenceWindowUtc[0])})`, `${c.referenceReadable}/${c.referenceRows}`, `${c.c4Numeric} / ${c.c4Usable}`, c.detectorSegments, c.quarantinedSecs, `${d.summary.ds4Events} (${c.eventsInsideReferenceWindow})`, d.summary.acceptedEvents, d.summary.oracleEvents, d.summary.visibleRuns];
  }),
));

// ---------- pooled ----------
out.push('## 2. Kennzahlen (gepoolt)');
out.push('');
const pools = summary.pooled;
out.push(...table(
  ['Kennzahl', 'EVAL (TIG22+TES16)', 'DEV (TES21-1+2)', 'ALLE'],
  [
    ['DS4-Ereignisse gesamt', pools.EVAL_TIG22_TES16.ds4Events, pools.DEV_TES21.ds4Events, pools.ALL.ds4Events],
    ['davon prüfbar (§5.1, N2)', pools.EVAL_TIG22_TES16.verifiableEvents, pools.DEV_TES21.verifiableEvents, pools.ALL.verifiableEvents],
    ['TREFFER', cnt(pools.EVAL_TIG22_TES16.ds4ByClass, 'TREFFER'), cnt(pools.DEV_TES21.ds4ByClass, 'TREFFER'), cnt(pools.ALL.ds4ByClass, 'TREFFER')],
    ['TREFFER_FRAGMENT', cnt(pools.EVAL_TIG22_TES16.ds4ByClass, 'TREFFER_FRAGMENT'), cnt(pools.DEV_TES21.ds4ByClass, 'TREFFER_FRAGMENT'), cnt(pools.ALL.ds4ByClass, 'TREFFER_FRAGMENT')],
    ['FEHLALARM (hart)', cnt(pools.EVAL_TIG22_TES16.ds4ByClass, 'FEHLALARM'), cnt(pools.DEV_TES21.ds4ByClass, 'FEHLALARM'), cnt(pools.ALL.ds4ByClass, 'FEHLALARM')],
    ['WEICHER_FEHLALARM', cnt(pools.EVAL_TIG22_TES16.ds4ByClass, 'WEICHER_FEHLALARM'), cnt(pools.DEV_TES21.ds4ByClass, 'WEICHER_FEHLALARM'), cnt(pools.ALL.ds4ByClass, 'WEICHER_FEHLALARM')],
    ['FEHLALARM_INTENSITAET', cnt(pools.EVAL_TIG22_TES16.ds4ByClass, 'FEHLALARM_INTENSITAET'), cnt(pools.DEV_TES21.ds4ByClass, 'FEHLALARM_INTENSITAET'), cnt(pools.ALL.ds4ByClass, 'FEHLALARM_INTENSITAET')],
    ['FEHLALARM_UNBESTIMMT (N2)', cnt(pools.EVAL_TIG22_TES16.ds4ByClass, 'FEHLALARM_UNBESTIMMT'), cnt(pools.DEV_TES21.ds4ByClass, 'FEHLALARM_UNBESTIMMT'), cnt(pools.ALL.ds4ByClass, 'FEHLALARM_UNBESTIMMT')],
    ['UNVERIFIZIERBAR', cnt(pools.EVAL_TIG22_TES16.ds4ByClass, 'UNVERIFIZIERBAR'), cnt(pools.DEV_TES21.ds4ByClass, 'UNVERIFIZIERBAR'), cnt(pools.ALL.ds4ByClass, 'UNVERIFIZIERBAR')],
    ['harte FA / prüfbar', pools.EVAL_TIG22_TES16.hardFalseAlarmShareOfVerifiable, pools.DEV_TES21.hardFalseAlarmShareOfVerifiable, pools.ALL.hardFalseAlarmShareOfVerifiable],
    ['harte FA, strikte Zuordnung (N1)', cnt(pools.EVAL_TIG22_TES16.strict.ds4ByClass, 'FEHLALARM'), cnt(pools.DEV_TES21.strict.ds4ByClass, 'FEHLALARM'), cnt(pools.ALL.strict.ds4ByClass, 'FEHLALARM')],
    ['Orakel-Manöver (T2)', pools.EVAL_TIG22_TES16.oracleEvents, pools.DEV_TES21.oracleEvents, pools.ALL.oracleEvents],
    ['ERKANNT', cnt(pools.EVAL_TIG22_TES16.oracleByStatus, 'ERKANNT'), cnt(pools.DEV_TES21.oracleByStatus, 'ERKANNT'), cnt(pools.ALL.oracleByStatus, 'ERKANNT')],
    ['VERPASST (hart)', cnt(pools.EVAL_TIG22_TES16.oracleByStatus, 'VERPASST'), cnt(pools.DEV_TES21.oracleByStatus, 'VERPASST'), cnt(pools.ALL.oracleByStatus, 'VERPASST')],
    ['VERPASST_GRENZWERTIG', cnt(pools.EVAL_TIG22_TES16.oracleByStatus, 'VERPASST_GRENZWERTIG'), cnt(pools.DEV_TES21.oracleByStatus, 'VERPASST_GRENZWERTIG'), cnt(pools.ALL.oracleByStatus, 'VERPASST_GRENZWERTIG')],
    ['VERPASST_KEINE_DS4_GESCHWINDIGKEIT', cnt(pools.EVAL_TIG22_TES16.oracleByStatus, 'VERPASST_KEINE_DS4_GESCHWINDIGKEIT'), cnt(pools.DEV_TES21.oracleByStatus, 'VERPASST_KEINE_DS4_GESCHWINDIGKEIT'), cnt(pools.ALL.oracleByStatus, 'VERPASST_KEINE_DS4_GESCHWINDIGKEIT')],
    ['Recall harte Manöver (Nenner)', `${pools.EVAL_TIG22_TES16.recallHardOracle} (${pools.EVAL_TIG22_TES16.recallHardOracleDenominator})`, `${pools.DEV_TES21.recallHardOracle} (${pools.DEV_TES21.recallHardOracleDenominator})`, `${pools.ALL.recallHardOracle} (${pools.ALL.recallHardOracleDenominator})`],
    ['Beginn-Versatz Median [min..max] s', `${pools.EVAL_TIG22_TES16.offsets.start.medianS} [${pools.EVAL_TIG22_TES16.offsets.start.minS}..${pools.EVAL_TIG22_TES16.offsets.start.maxS}]`, `${pools.DEV_TES21.offsets.start.medianS} [${pools.DEV_TES21.offsets.start.minS}..${pools.DEV_TES21.offsets.start.maxS}]`, `${pools.ALL.offsets.start.medianS} [${pools.ALL.offsets.start.minS}..${pools.ALL.offsets.start.maxS}]`],
    ['Ende-Versatz Median [min..max] s', `${pools.EVAL_TIG22_TES16.offsets.end.medianS} [${pools.EVAL_TIG22_TES16.offsets.end.minS}..${pools.EVAL_TIG22_TES16.offsets.end.maxS}]`, `${pools.DEV_TES21.offsets.end.medianS} [${pools.DEV_TES21.offsets.end.minS}..${pools.DEV_TES21.offsets.end.maxS}]`, `${pools.ALL.offsets.end.medianS} [${pools.ALL.offsets.end.minS}..${pools.ALL.offsets.end.maxS}]`],
    ['Beginn innerhalb ±2 s', pools.EVAL_TIG22_TES16.offsets.start.withinTolShare, pools.DEV_TES21.offsets.start.withinTolShare, pools.ALL.offsets.start.withinTolShare],
    ['Δv-Abweichung zu Orakel: Bias / MAE / max km/h', `${pools.EVAL_TIG22_TES16.deltaDiffKmh.biasKmh} / ${pools.EVAL_TIG22_TES16.deltaDiffKmh.maeKmh} / ${pools.EVAL_TIG22_TES16.deltaDiffKmh.maxAbsKmh}`, `${pools.DEV_TES21.deltaDiffKmh.biasKmh} / ${pools.DEV_TES21.deltaDiffKmh.maeKmh} / ${pools.DEV_TES21.deltaDiffKmh.maxAbsKmh}`, `${pools.ALL.deltaDiffKmh.biasKmh} / ${pools.ALL.deltaDiffKmh.maeKmh} / ${pools.ALL.deltaDiffKmh.maxAbsKmh}`],
    ['sichtbare Läufe (T3): erkannt / verpasst oberhalb / unterhalb', `${cnt(pools.EVAL_TIG22_TES16.visibleRunsByStatus, 'ERKANNT')} / ${cnt(pools.EVAL_TIG22_TES16.visibleRunsByStatus, 'VERPASST_OBERHALB_SCHWELLE')} / ${cnt(pools.EVAL_TIG22_TES16.visibleRunsByStatus, 'NICHT_ERWARTET_UNTERHALB_SCHWELLE') + cnt(pools.EVAL_TIG22_TES16.visibleRunsByStatus, 'ERKANNT_UNTERHALB_SCHWELLE')}`, `${cnt(pools.DEV_TES21.visibleRunsByStatus, 'ERKANNT')} / ${cnt(pools.DEV_TES21.visibleRunsByStatus, 'VERPASST_OBERHALB_SCHWELLE')} / ${cnt(pools.DEV_TES21.visibleRunsByStatus, 'NICHT_ERWARTET_UNTERHALB_SCHWELLE') + cnt(pools.DEV_TES21.visibleRunsByStatus, 'ERKANNT_UNTERHALB_SCHWELLE')}`, `${cnt(pools.ALL.visibleRunsByStatus, 'ERKANNT')} / ${cnt(pools.ALL.visibleRunsByStatus, 'VERPASST_OBERHALB_SCHWELLE')} / ${cnt(pools.ALL.visibleRunsByStatus, 'NICHT_ERWARTET_UNTERHALB_SCHWELLE') + cnt(pools.ALL.visibleRunsByStatus, 'ERKANNT_UNTERHALB_SCHWELLE')}`],
  ],
));

// ---------- per drive ----------
let section = 3;
for (const d of summary.drives) {
  const id = d.id;
  const events = csv(`${id}_events.csv`);
  const oracle = csv(`${id}_oracle.csv`);
  const windows = csv(`${id}_operator_windows.csv`);
  const runs = csv(`${id}_visible_runs.csv`);
  out.push(`## ${section++}. ${id} — ${d.identity.role}, ${d.identity.vehicleClass}, Trip \`${d.identity.tripId}\``);
  out.push('');
  out.push(`Qualitäten DS4: ${Object.entries(d.summary.ds4ByQuality).map(([q, n]) => `${q} ${n}`).join(', ')}. Grenznähe (§7, ≤ 2 s zu Segmentanfang/-ende/Quarantäne): ${d.summary.nearBoundary.total} Ereignisse (${Object.entries(d.summary.nearBoundary.byClass).map(([c, n]) => `${c} ${n}`).join(', ') || '–'}). Unplausibel (§8): ${d.summary.implausible.length}. Artefaktsicht (N1): ${d.summary.artefactSuspectView.length}.`);
  out.push('');
  if (d.production) {
    out.push(`Produktionsparität: Lauf \`${d.production.runId}\` (${d.production.createdAtUtc}, Bundle ${d.production.bundle}) — Replay identisch: **${d.production.identical ? 'ja' : 'nein'}** (${d.production.prodEventCount} = ${d.production.replayEventCount} Ereignisse). Vor Deploy (${d.production.preDeploy.bundle}): ${d.production.preDeploy.eventCount} Ereignisse; nur vor Deploy: ${d.production.preDeploy.onlyPreDeploy.join(', ') || '–'}; nur jetzt: ${d.production.preDeploy.onlyNow.join(', ') || '–'}.`);
    out.push('');
  }

  out.push(`### ${id} · Manövertabelle (T2-Orakel: derselbe Detektor auf der Referenzreihe)`);
  out.push('');
  out.push(...table(
    ['#', 'Art', 'UTC Beginn–Ende', 'Dauer s', 'Ref km/h', 'Δv', 'mittl. m/s²', 'Spitze 1 s', 'grenzw.', 'Status', 'DS4 Beginn–Ende', 'DS4 Δv', 'Versatz Beginn/Ende s', 'C4 unbrauchbar s'],
    oracle.map((o, i) => [i + 1, k(o.kind), `${hms(o.start_utc)}–${hms(o.end_utc)}`, o.duration_s, `${o.start_kmh}→${o.end_kmh}`, o.delta_kmh, o.mean_mps2, o.peak1s_mps2, yn(o.borderline), o.status, o.ds4_start_utc ? `${hms(o.ds4_start_utc)}–${hms(o.ds4_end_utc)}` : '–', v(o.ds4_delta_kmh), o.ds4_start_utc ? `${fmtOff(o.start_offset_s)} / ${fmtOff(o.end_offset_s)}` : '–', o.c4_null_or_unusable_in_window]),
  ));

  out.push(`### ${id} · DS4-Ereignistabelle (Detektorausgabe, Baseline)`);
  out.push('');
  out.push(...table(
    ['#', 'Art', 'UTC Beginn–Ende', 'Dauer s', 'C4 km/h', 'Δv', 'mittl. m/s²', 'Spitze 1 s', 'Qualität', 'akz.', 'Klasse', 'Hinweis', 'Δv − Orakel', 'Δv-Fehler gleiches Fenster', 'unplaus.', 'Grenznähe', 's seit Seg.-Anfang / bis Seg.-Ende', 'nächste Lücke s', 'Anteil nicht-OK', 'Artefaktsicht'],
    events.map((e, i) => [i + 1, k(e.kind), `${hms(e.start_utc)}–${hms(e.end_utc)}`, e.duration_s, `${e.start_kmh}→${e.end_kmh}`, e.delta_kmh, e.mean_mps2, e.peak1s_mps2, e.quality, yn(e.accepted), e.cls, e.note, v(e.delta_diff_kmh), v(e.delta_err_same_window_kmh), yn(e.implausible), yn(e.near_boundary), `${v(e.secs_since_seg_start)} / ${v(e.secs_to_seg_end)}`, v(e.nearest_position_gap_s), v(e.non_ok_share), yn(e.artefact_suspect_view)]),
  ));

  if (windows.length) {
    out.push(`### ${id} · T1 Operatorfenster (Analysefenster der Referenzaufnahme)`);
    out.push('');
    out.push(...table(
      ['#', 'Art', 'Clip', 'UTC Beginn–Ende', 'Dauer s', 'Ref km/h', 'mittl. Anzeige m/s²', 'Ref-Spitze 1 s', 'Orakel im Fenster', 'Status', 'DS4 Beginn–Ende', 'DS4 Δv', 'Versatz Beginn/Ende s'],
      windows.map((w, i) => [i + 1, k(w.kind), w.clip, `${hms(w.start_utc)}–${hms(w.end_utc)}`, Math.round(Number(w.duration_s)), `${w.start_kmh}→${w.end_kmh}`, w.mean_display_mps2, w.ref_peak1s_mps2, w.oracle_events_in_window, w.status, w.ds4_start_utc ? `${hms(w.ds4_start_utc)}–${hms(w.ds4_end_utc)}` : '–', v(w.ds4_delta_kmh), w.ds4_start_utc ? `${fmtOff(w.start_offset_s)} / ${fmtOff(w.end_offset_s)}` : '–']),
    ));
  }

  const missedAbove = runs.filter((r) => r.status === 'VERPASST_OBERHALB_SCHWELLE');
  out.push(`### ${id} · T3 sichtbare monotone Läufe (|Δv| ≥ 10 km/h, ≥ 3 s)`);
  out.push('');
  out.push(`${runs.length} Läufe: ${Object.entries(d.summary.visibleRunsByStatus).map(([s, n]) => `${s} ${n}`).join(', ')}.`);
  out.push('');
  if (missedAbove.length) {
    out.push('Läufe mit Orakel oberhalb der Schwelle ohne DS4-Ereignis:');
    out.push('');
    out.push(...table(['Art', 'UTC Beginn–Ende', 'Ref km/h', 'Δv', 'mittl. m/s²', 'Spitze 1 s'], missedAbove.map((r) => [k(r.kind), `${hms(r.start_utc)}–${hms(r.end_utc)}`, `${r.start_kmh}→${r.end_kmh}`, r.delta_kmh, r.mean_mps2, r.peak1s_mps2])));
  }
}

fs.writeFileSync(path.join(outDir, 'TABLES.md'), out.join('\n'));
console.log(`written: ${path.relative(process.cwd(), path.join(outDir, 'TABLES.md'))}`);
