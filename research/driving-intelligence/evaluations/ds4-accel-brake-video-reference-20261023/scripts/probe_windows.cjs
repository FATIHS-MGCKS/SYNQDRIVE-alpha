#!/usr/bin/env node
'use strict';
/**
 * Second-by-second probe of selected windows (reference, C4 value/quality/flags, position availability, OBD
 * comparison series) for cause analysis of misses / artefacts. Read-only on the same sealed inputs.
 *
 *   node scripts/probe_windows.cjs [--code-root <repo-checkout>] [--tag <label>]
 *
 * Windows are listed in PROBE_WINDOWS below (derived from outputs/<tag>/*_oracle.csv and *_events.csv findings).
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const L = require('../../ds4-speed-video-reference-20261023/scripts/eval_lib.cjs');

const evalRoot = path.resolve(__dirname, '..');
const speedEvalRoot = path.resolve(evalRoot, '../ds4-speed-video-reference-20261023');
const thisRepo = path.resolve(evalRoot, '../../../..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const codeRoot = path.resolve(opt('--code-root', thisRepo));
const tag = opt('--tag', 'main');
const DI = 'backend/src/modules/vehicle-intelligence/driving-intelligence';
const outDir = path.join(evalRoot, 'outputs', tag);

require(path.join(codeRoot, 'backend/node_modules/ts-node')).register({ transpileOnly: true, project: path.join(codeRoot, 'backend/tsconfig.json') });
const req = (rel) => require(path.join(codeRoot, DI, rel));
const { parseDiV0S4EvidenceContainer } = req('s4a-foundation/di-v0-s4a-evidence-container-parse.ts');
const { adaptMotionCoreShadowEvidenceFromParsedContainer } = req('motion-core-shadow-worker/di-v0-motion-core-shadow-evidence.adapter.ts');
const core = req('core/index.ts');

const PROBE_WINDOWS = [
  { drive: 'TIG22', from: '2026-10-22T18:40:52Z', to: '2026-10-22T18:41:03Z', why: 'Orakel DECEL 18:40:56–58 VERPASST_KEINE_DS4_GESCHWINDIGKEIT (Anhalten TC_00077)' },
  { drive: 'TIG22', from: '2026-10-22T18:41:08Z', to: '2026-10-22T18:41:16Z', why: 'Orakel ACCEL 18:41:11–13 (2→15) VERPASST_GRENZWERTIG (Anfahren)' },
  { drive: 'TIG22', from: '2026-10-22T18:44:08Z', to: '2026-10-22T18:44:22Z', why: 'Orakel ACCEL 18:44:16–18 (0→15, 2,5 m/s²) VERPASST (Anfahren nach Stopp TC_00078 156–162)' },
  { drive: 'TIG22', from: '2026-10-22T19:04:20Z', to: '2026-10-22T19:04:53Z', why: 'Trip-Ende: 4 Ereignisse außerhalb Video, 2 physikalisch unplausibel (5,5→100,1; 52,3→142,1)' },
  { drive: 'TES16', from: '2026-10-16T03:39:46Z', to: '2026-10-16T03:39:57Z', why: 'Orakel ACCEL 03:39:48–55 (4→40) erkannt mit Beginn-Versatz +4 s' },
  { drive: 'TES16', from: '2026-10-16T03:44:32Z', to: '2026-10-16T03:44:46Z', why: 'Orakel ACCEL 03:44:35–41 (0→42) erkannt mit Beginn-Versatz +5 s; 3 s ohne nutzbares C4' },
  { drive: 'TES16', from: '2026-10-16T03:50:12Z', to: '2026-10-16T03:50:26Z', why: 'DS4 ACCEL 03:50:20–23 (113→148) TREFFER_FRAGMENT, Referenz flach ~132 → Jitter-Artefakt' },
  { drive: 'TES21-1', from: '2026-10-21T12:04:37Z', to: '2026-10-21T12:04:45Z', why: 'Orakel ACCEL 12:04:40–42 (23→42, 3,3 m/s²) VERPASST' },
  { drive: 'TES21-1', from: '2026-10-21T12:05:18Z', to: '2026-10-21T12:05:25Z', why: 'DS4 DECEL 12:05:20–23 DEGRADED WEICHER_FEHLALARM' },
  { drive: 'TES21-1', from: '2026-10-21T12:06:24Z', to: '2026-10-21T12:06:31Z', why: 'DS4 ACCEL 12:06:26–28 ARTEFACT_SUSPECT (K3) FEHLALARM, Referenz flach 45' },
  { drive: 'TES21-2', from: '2026-10-21T12:22:10Z', to: '2026-10-21T12:22:18Z', why: 'Orakel ACCEL 12:22:13–16 (6→28) VERPASST_KEINE_DS4_GESCHWINDIGKEIT' },
  { drive: 'TES21-2', from: '2026-10-21T12:23:05Z', to: '2026-10-21T12:23:12Z', why: 'Orakel ACCEL 12:23:07–10 (0→22) VERPASST_KEINE_DS4_GESCHWINDIGKEIT' },
];

function loadContainer(rel, family, gz) {
  let text = fs.readFileSync(path.join(speedEvalRoot, 'inputs', rel));
  if (gz) text = zlib.gunzipSync(text);
  const parsed = parseDiV0S4EvidenceContainer(text.toString('utf8'));
  const ad = adaptMotionCoreShadowEvidenceFromParsedContainer(parsed, family);
  return { buckets: ad.buckets, c4: core.computeC4AdaptiveL3(ad.buckets), obd: new Map(ad.sparseSpeed.map((s) => [L.secOf(s.label), s.speedKmh])) };
}

const drives = {};
{
  const ref = L.parseCsv(fs.readFileSync(path.join(speedEvalRoot, 'inputs/tiguan-20261022/reference/TIGUAN_2026-10-22_1Hz.csv'), 'utf8'));
  drives.TIG22 = { ref: new Map(ref.map((r) => [L.secOf(r.time_utc_estimated), L.numOrNull(r.speed_display_kmh)])), ...loadContainer('tiguan-20261022/snapshots/di_v0_s4_evidence_container.bin', 'RUPTELA_R1', false) };
  const joined = L.parseCsv(fs.readFileSync(path.join(speedEvalRoot, 'inputs/tesla-20261021/JOINED_REFERENCE_TABLE.csv'), 'utf8'));
  for (const [key, tripNo] of [['TRIP_1', 1], ['TRIP_2', 2]]) {
    const m = new Map();
    for (const r of joined.filter((x) => x.trip === String(tripNo))) {
      const sec = L.secOf(r.bucket_label_utc);
      if (m.has(sec)) continue;
      m.set(sec, r.inclusion_flag === 'INCLUDE' && r.speed_status === 'VISIBLE_DISPLAY_VALUE' ? L.numOrNull(r.tesla_speed_kmh_primary) : null);
    }
    drives[`TES21-${tripNo}`] = { ref: m, ...loadContainer(`tesla-20261021/s4_evidence/${key}_evidence_payload.gz`, 'API_SYNTHETIC', true) };
  }
  const fx = path.join(thisRepo, 'architecture/drivingintelligence/evidence/ldi-10d/fixtures/tesla-20261016');
  const refJson = JSON.parse(fs.readFileSync(path.join(fx, 'VIDEO_TACHO_REFERENCE.json'), 'utf8'));
  const grid = JSON.parse(fs.readFileSync(path.join(fx, 'TESLA_POSITION_GRID.json'), 'utf8'));
  const buckets = grid.buckets.map((b) => ({ bucketLabelUtc: b.bucketLabelUtc, availability: b.availability, latitude: b.latitude, longitude: b.longitude }));
  drives.TES16 = { ref: new Map(refJson.rows.map((r) => [L.secOf(r.bucketLabelUtc), r.tachoKmh == null ? null : Number(r.tachoKmh)])), buckets, c4: core.computeC4AdaptiveL3(buckets), obd: new Map() };
}

const lines = ['# Fenster-Sonden (Sekundenraster) — Ursachenanalyse', '', `Code \`${tag}\`; Spalten: Referenz-km/h (Video), C4-km/h, C4-Qualität, C4-Flags, Position (P = vorhanden, − = fehlt, = = identische Koordinaten zum Vorgänger), OBD-km/h (nur Vergleich, TIG22).`, ''];
for (const w of PROBE_WINDOWS) {
  const d = drives[w.drive];
  const c4By = new Map(d.c4.map((s) => [L.secOf(s.label), s]));
  const bBy = new Map(d.buckets.map((b) => [L.secOf(b.bucketLabelUtc), b]));
  lines.push(`## ${w.drive} ${w.from} … ${w.to}`, '', w.why, '', '| UTC | Ref | C4 | Qualität | Flags | Pos | OBD |', '| --- | --- | --- | --- | --- | --- | --- |');
  let prev = null;
  for (let s = L.secOf(w.from); s <= L.secOf(w.to); s++) {
    const c = c4By.get(s);
    const b = bBy.get(s);
    let pos = b ? (b.availability === 'PRESENT' && b.latitude != null ? 'P' : '−') : 'n/a';
    if (pos === 'P' && prev && prev.latitude === b.latitude && prev.longitude === b.longitude) pos = '=';
    if (b && b.availability === 'PRESENT' && b.latitude != null) prev = b;
    const ref = d.ref.get(s);
    lines.push(`| ${L.labelOf(s * 1000).slice(11, 19)} | ${ref == null ? '·' : ref} | ${c && c.valueKmh != null ? L.round(c.valueKmh, 1) : '·'} | ${c ? c.quality : 'n/a'} | ${c ? (c.flags ?? []).join(' ') : ''} | ${pos} | ${d.obd.get(s) ?? ''} |`);
  }
  lines.push('');
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'PROBES.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
