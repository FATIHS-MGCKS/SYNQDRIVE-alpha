#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const L = require('../../ds4-speed-video-reference-20261023/scripts/eval_lib.cjs');
const summary = JSON.parse(fs.readFileSync(path.join(__dirname, '../outputs/c5_regression_summary.json'), 'utf8'));
const outDir = path.join(__dirname, '../outputs/charts');
fs.mkdirSync(outDir, { recursive: true });

function loadSeries(id) {
  const p = path.join(__dirname, `../outputs/${id}_c5_series.json`);
  const c5 = JSON.parse(fs.readFileSync(p, 'utf8'));
  const c5Map = new Map(c5.map((r) => [L.secOf(r.label), r]));
  return c5Map;
}

function svgLineChart({ title, fromSec, toSec, refBySec, c4, c5Map, width = 900, height = 320 }) {
  const pts = [];
  for (let s = fromSec; s <= toSec; s++) {
    const ref = refBySec.get(s);
    if (ref == null) continue;
    pts.push({
      s,
      ref,
      c4: c4.get(s)?.valueKmh ?? null,
      c5: c5Map.get(s)?.v ?? null,
      unk: c5Map.get(s)?.v == null,
    });
  }
  if (!pts.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="10" y="20">no data</text></svg>`;
  const ymin = Math.min(...pts.map((p) => Math.min(p.ref, p.c4 ?? p.ref, p.c5 ?? p.ref))) - 5;
  const ymax = Math.max(...pts.map((p) => Math.max(p.ref, p.c4 ?? p.ref, p.c5 ?? p.ref))) + 5;
  const x0 = 50;
  const y0 = height - 40;
  const w = width - 70;
  const h = height - 70;
  const x = (i) => x0 + (i / (pts.length - 1 || 1)) * w;
  const y = (v) => y0 - ((v - ymin) / (ymax - ymin || 1)) * h;
  const poly = (key) =>
    pts
      .filter((p) => p[key] != null)
      .map((p, i) => `${x(i)},${y(p[key])}`)
      .join(' ');
  const unkMarks = pts
    .map((p, i) => (p.unk ? `<circle cx="${x(i)}" cy="${y0}" r="4" fill="#c00" opacity="0.7"/>` : ''))
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#fafafa"/>
  <text x="${x0}" y="22" font-family="sans-serif" font-size="14" font-weight="bold">${title}</text>
  <text x="${x0}" y="${height - 8}" font-family="sans-serif" font-size="11">time →</text>
  <text x="8" y="${y0}" font-family="sans-serif" font-size="11" transform="rotate(-90 8 ${y0})">km/h</text>
  <line x1="${x0}" y1="${y0}" x2="${x0 + w}" y2="${y0}" stroke="#999"/>
  <line x1="${x0}" y1="${y0 - h}" x2="${x0}" y2="${y0}" stroke="#999"/>
  <polyline fill="none" stroke="#333" stroke-width="2" points="${poly('ref')}"/>
  <polyline fill="none" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="4 3" points="${poly('c4')}"/>
  <polyline fill="none" stroke="#16a34a" stroke-width="2" points="${poly('c5')}"/>
  ${unkMarks}
  <text x="${x0 + 10}" y="40" font-size="11" fill="#333">■ video ref</text>
  <text x="${x0 + 110}" y="40" font-size="11" fill="#2563eb">■ C4</text>
  <text x="${x0 + 180}" y="40" font-size="11" fill="#16a34a">■ C5 PTQ</text>
  <text x="${x0 + 280}" y="40" font-size="11" fill="#c00">● C5 UNKNOWN</text>
</svg>`;
}

// TES16 critical + context
const tesRows = summary.tes16.rows;
const refTes = new Map(tesRows.map((r) => [r.sec, r.ref]));
const fromT = L.secOf('2026-10-16T03:50:10Z');
const toT = L.secOf('2026-10-16T03:50:30Z');
const R = require('../../ds4-accel-brake-video-reference-20261023/scripts/replay_event_eval.cjs');
const d16 = R.loadDrives().find((d) => d.id === 'TES16');
const c4Map = new Map(d16.c4.map((s) => [L.secOf(s.label), s]));
const c5Map = loadSeries('TES16');
const fullRef = new Map(d16.refRows.map((r) => [r.sec, r.ref]));
fs.writeFileSync(
  path.join(outDir, 'TES16_speed_timeseries.svg'),
  svgLineChart({ title: 'TES16 video vs C4 vs C5 (03:50:10–30 UTC)', fromSec: fromT, toSec: toT, refBySec: fullRef, c4: c4Map, c5Map }),
);

const d22 = R.loadDrives().find((d) => d.id === 'TIG22');
const c4T = new Map(d22.c4.map((s) => [L.secOf(s.label), s]));
const c5T = loadSeries('TIG22');
const refT = new Map(d22.refRows.map((r) => [r.sec, r.ref]));
const fromG = L.secOf('2026-10-22T19:04:25Z');
const toG = L.secOf('2026-10-22T19:04:55Z');
fs.writeFileSync(
  path.join(outDir, 'TIG22_1904_timeseries.svg'),
  svgLineChart({ title: 'TIG22 19:04 window (video ref where readable)', fromSec: fromG, toSec: toG, refBySec: refT, c4: c4T, c5Map: c5T }),
);

console.log('charts written to', outDir);
