#!/usr/bin/env node
'use strict';
/**
 * TIG22 trip tail 19:04 UTC — read-only forensic grid (positions, Δt, C4, quarantine, OBD comparison).
 * OBD is comparison only; no acceleration limit derived from 0–100 time alone.
 */
const fs = require('node:fs');
const path = require('node:path');
const L = require('../../ds4-speed-video-reference-20261023/scripts/eval_lib.cjs');
const R = require('./replay_event_eval.cjs');

const outPath = path.join(R.outDir.replace(/outputs\/[^/]+$/, 'outputs'), 'match2s', 'TIG22_TRIP_END_FORENSIC.md');
const fromSec = L.secOf('2026-10-22T19:04:00Z');
const toSec = L.secOf('2026-10-22T19:04:55Z');

function haversineM(lat1, lon1, lat2, lon2) {
  const Rm = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * Rm * Math.asin(Math.sqrt(a));
}

function main() {
  const d = R.loadDrives().find((x) => x.id === 'TIG22');
  if (!d) throw new Error('TIG22 not loaded');
  const c4By = new Map(d.c4.map((s) => [L.secOf(s.label), s]));
  const bucketBy = new Map(d.buckets.map((b) => [L.secOf(b.bucketLabelUtc), b]));
  const obdBy = new Map((d.obdRows || []).map((r) => [r.sec, r.speedKmh]));
  const events = d.events.filter((e) => {
    const s = L.secOf(e.startLabel);
    return s >= fromSec && s <= toSec;
  });

  const lines = [];
  lines.push('# TIG22 Trip-Ende 19:04 UTC — Forensik (read-only Replay)');
  lines.push('');
  lines.push('Referenzvideo endet vor diesem Abschnitt; **OBD-Speed nur Vergleichsserie** (R1, nicht als Manöver-Referenz).');
  lines.push('Physikalische Plausibilität §8 ist eine **Vorsortierung**, keine aus 0–100-Zeit allein abgeleitete harte Grenze.');
  lines.push('');
  lines.push('## DS4-Ereignisse in diesem Fenster');
  lines.push('');
  for (const e of events) {
    lines.push(`- **${e.kind}** ${e.startLabel.slice(11, 19)}–${e.endLabel.slice(11, 19)}: ${e.startSpeedKmh}→${e.endSpeedKmh} km/h, Δv=${e.deltaKmh}, mean=${e.meanAccelMps2} m/s², qual=${e.quality}, flags=${(e.flags || []).slice(0, 2).join('|')}`);
  }
  lines.push('');
  lines.push('## Sekundenraster');
  lines.push('');
  lines.push('| UTC | Δt Pos (s) | Leg m | Pos | C4 | Qualität | Flags (kurz) | OBD km/h | C4/OBD |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');

  let prevPos = null;
  for (let sec = fromSec; sec <= toSec; sec++) {
    const label = L.labelOf(sec * 1000);
    const b = bucketBy.get(sec);
    const c = c4By.get(sec);
    const obd = obdBy.get(sec);
    let dt = '';
    let leg = '';
    let pos = '−';
    if (b && b.availability === 'PRESENT' && b.latitude != null) {
      pos = 'P';
      if (prevPos) {
        dt = String(sec - prevPos.sec);
        leg = String(Math.round(haversineM(prevPos.lat, prevPos.lon, b.latitude, b.longitude)));
      }
      prevPos = { sec, lat: b.latitude, lon: b.longitude };
    }
    const c4v = c?.valueKmh != null ? String(L.round(c.valueKmh, 1)) : '·';
    const qual = c?.quality ?? '—';
    const flags = (c?.flags ?? []).filter((f) => /OUTLIER|QUARANT|JITTER|SPARSE|MIN_SUPPORT|NO_/.test(f)).slice(0, 2).join(' ') || '';
    const obdS = obd != null ? String(obd) : '·';
    const ratio = obd != null && c?.valueKmh != null && obd > 3 ? L.round(c.valueKmh / obd, 2) : '';
    lines.push(`| ${label.slice(11, 19)} | ${dt} | ${leg} | ${pos} | ${c4v} | ${qual} | ${flags} | ${obdS} | ${ratio} |`);
  }

  lines.push('');
  lines.push('## Einordnung (bestätigt vs. Verdacht)');
  lines.push('');
  lines.push('| Befund | Status | Beleg |');
  lines.push('| --- | --- | --- |');
  lines.push('| C4-Speed liegt über weiten Strecken **systematisch höher** als OBD (Ratio oft ≈1,5–2,0) | **bestätigt** (Vergleichsserie) | Sekunden mit Pos+OBD im Raster; kein Video-GT |');
  lines.push('| Vier DS4-Ereignisse entstehen auf **nicht-OK** C4-Stützpunkten (SPARSE/JITTER/LIMITED/DEGRADED) | **bestätigt** | Ereignisqualität + Flags im Raster |');
  lines.push('| `OUTLIER_REJECTED` bei 19:04:37 (`CHORD_DEVIATION`) — Quarantänegrenze | **bestätigt** | C4-Flag + fehlende Pos-Sekunden davor/nachher |');
  lines.push('| Zwei Ereignisse überschreiten §8-Tiguan-Mittel **4,5 m/s²** (5,5→100,1; 52,3→142,1) | **Verdacht physikalisch unplausibel** | Schranke = Vorsortierung; Richtung mit OBD-Manövern vereinbar, Betrag durch C4-Skala |');
  lines.push('| Ursache „2× OBD“ im Speed-Pfad | **Verdacht, Speed-Workstream** | Nicht durch Video verifizierbar; hier nur dokumentiert |');
  lines.push('| Ob die vier Ereignisse **fachlich falsch** (Richtung/Dauer) sind | **nicht bewertbar** ohne unabhängige Referenz im Fenster | Video endet früher |');

  const dir = path.dirname(outPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log('written:', outPath);
}

if (require.main === module) main();
