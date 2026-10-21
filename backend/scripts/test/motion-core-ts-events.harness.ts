/**
 * EXP021 motion event detector — Tesla evaluation artifacts.
 * cd backend && npx ts-node --transpile-only scripts/test/motion-core-ts-events.harness.ts
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

import {
  computeC4AdaptiveL3,
  detectMotionManoeuvreEvents,
  parseBucketLabelMs,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/core';

const OUT = process.env.MOTION_CORE_TS_EVENTS_OUT ?? '/opt/cursor/artifacts/exp021-motion-core-ts-events';
const PHASE5C =
  process.env.EXP021_PHASE5C_ROOT ?? '/opt/cursor/artifacts/exp021-phase5c-tesla-reference-20261021';
const DESIGN = '/opt/cursor/artifacts/exp021-motion-core-design';
const PY_PROTO = path.join(DESIGN, 'prototype');
const PY_ED = path.join(PY_PROTO, 'event_detector.py');

const TRIPS = [
  { key: 'TRIP_1', trip: 1 },
  { key: 'TRIP_2', trip: 2 },
];

function loadGrid(tripKey: string) {
  return JSON.parse(fs.readFileSync(path.join(PHASE5C, 'replay', `${tripKey}_position_grid.json`), 'utf8'))
    .buckets;
}

function sha256File(p: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function overlaps(a0: string, a1: string, b0: string, b1: string, padS: number): boolean {
  const as = parseBucketLabelMs(a0) / 1000 - padS;
  const ae = parseBucketLabelMs(a1) / 1000 + padS;
  const bs = parseBucketLabelMs(b0) / 1000;
  const be = parseBucketLabelMs(b1) / 1000;
  return as <= be && bs <= ae;
}

function loadDisplayManoeuvres(trip: number) {
  const csv = fs.readFileSync(path.join(DESIGN, 'results/EVENTS_VS_DISPLAY_MANOEUVRES.csv'), 'utf8');
  const lines = csv.trim().split('\n');
  const header = lines[0]!.split(',');
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    if (Number(row.trip) === trip) {
      rows.push({
        kind: row.kind,
        startLabel: row.start_label,
        endLabel: row.end_label,
        videoStart: row.video_start_local,
        videoEnd: row.video_end_local,
        deltaKmh: Number(row.delta_kmh),
      });
    }
  }
  return rows;
}

function displayLocalFromUtc(label: string): string {
  const d = new Date(parseBucketLabelMs(label) + 2 * 3600 * 1000);
  return d.toISOString().replace(/\.\d{3}Z$/, '').replace('T', 'T').slice(0, 19);
}

function pyEvents(trip: number, grid: unknown[]) {
  const tmpG = '/tmp/mc-ev-h-grid.json';
  const tmpOut = '/tmp/mc-ev-h-out.json';
  fs.writeFileSync(tmpG, JSON.stringify(grid));
  execSync(
    `python3 -c "import json, dataclasses; from speed_candidates import c4_adaptive_l3; from event_detector import detect_events; g=json.load(open('${tmpG}')); json.dump([dataclasses.asdict(e) for e in detect_events(${trip}, c4_adaptive_l3(g), 'C4_ADAPTIVE_L3')], open('${tmpOut}','w'))"`,
    { cwd: PY_PROTO, stdio: 'pipe' },
  );
  return JSON.parse(fs.readFileSync(tmpOut, 'utf8')) as Array<Record<string, unknown>>;
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const edHash = fs.existsSync(PY_ED) ? sha256File(PY_ED) : null;

  const table: unknown[] = [];
  const tripSummaries: Record<string, unknown> = {};
  let totalEvents = 0;
  let matched = 0;
  let degraded = 0;
  let b0Total = 0;

  for (const { key, trip } of TRIPS) {
    const grid = loadGrid(key);
    const c4 = computeC4AdaptiveL3(grid);
    const tsEv = detectMotionManoeuvreEvents(trip, c4, 'C4_ADAPTIVE_L3');
    const pyEv = pyEvents(trip, grid);
    const mans = loadDisplayManoeuvres(trip);
    const pyB0 = Number(
      execSync(
        `python3 -c "from speed_candidates import CANDIDATES; from event_detector import detect_events; from common import load_grid; g=load_grid(${trip}); print(len(detect_events(${trip}, CANDIDATES['B0_FROZEN_L3'](g), 'B0_FROZEN_L3')))"`,
        { cwd: PY_PROTO, encoding: 'utf8' },
      ).trim(),
    );
    b0Total += pyB0;

    let tripMatched = 0;
    let tripDegraded = 0;
    for (const e of tsEv) {
      const ref = mans.find(
        (m) =>
          m.kind === e.kind &&
          overlaps(e.startLabel, e.endLabel, m.startLabel, m.endLabel, 3),
      );
      const isDegraded = e.quality === 'DEGRADED';
      if (isDegraded) {
        tripDegraded += 1;
        degraded += 1;
      }
      if (ref) {
        tripMatched += 1;
        matched += 1;
      }
      table.push({
        trip,
        timeUtc: `${e.startLabel}..${e.endLabel}`,
        timeDisplayAssumedCest: `${displayLocalFromUtc(e.startLabel)}..${displayLocalFromUtc(e.endLabel)}`,
        kind: e.kind,
        deltaVKmh: e.deltaKmh,
        durationS: e.durationS,
        strengthPeak1sMps2: e.peakAccel1sMps2,
        quality: e.quality,
        referenceAssignment: ref ? `display ${ref.videoStart}` : 'none',
        decisionTimeNote: 'finalized at end_label (offline segment); C4 input horizon t±2..+3',
        limitation: isDegraded ? 'DEGRADED — not counted as clean manoeuvre' : '',
      });
    }
    totalEvents += tsEv.length;
    tripSummaries[key] = {
      c4EventCount: tsEv.length,
      pythonParityCount: pyEv.length,
      displayManoeuvreMatched: tripMatched,
      degradedCount: tripDegraded,
      baselineB0EventCount: pyB0,
      events: tsEv,
    };
  }

  const spec = `# Event detector — Fable reference

**Source:** \`event_detector.py\` SHA256 \`${edHash}\`

## Inputs
- 1 Hz \`SpeedSample\` series only (C4 in this chain); **no FSM**, no video.
- Usable qualities: OK, SPARSE_SUPPORT, JITTER_SUSPECT, REPAIRED, SPAN_SUPPORT, SPAN_DERIVED.

## Thresholds (HF V1 reused, unchanged)
- entry 1.5 m/s², continue 1.2 m/s², min 2 steps, min Δv 4/3 km/h, merge 2.0/1.5 s.

## Guards
- segment break if gap > 2 s between usable samples; post-gap guard 2 s before event start.

## Quality
- OK if all OK; DEGRADED if JITTER_SUSPECT or REPAIRED in window; else LIMITED.

## Finalization
- Event end when 1 s accel drops below continue threshold; offline replay only.
`;

  fs.writeFileSync(path.join(OUT, 'EVENT_DETECTOR_SPEC.md'), spec);
  fs.writeFileSync(path.join(OUT, 'EVENT_TABLE.json'), JSON.stringify(table, null, 2));
  fs.writeFileSync(
    path.join(OUT, 'EVENT_STEP_REPORT.json'),
    JSON.stringify(
      {
        generatedUtc: new Date().toISOString(),
        developmentDataOnly: true,
        eventModel: { version: 'HF_THRESHOLDS_V1_REUSED + MOTION_CORE_EVENT_GUARDS_V0_1_DEV', pySha256: edHash },
        c4EventsTotal: totalEvents,
        displayManoeuvreMatched: matched,
        degradedEvents: degraded,
        baselineB0EventsCombined: b0Total,
        tripSummaries,
        prototypePreflight: {
          c4EventsTrip1: 4,
          c4EventsTrip2: 4,
          c4ArtefactTrip1: 1,
          note: 'Matched counts use ±3 s overlap vs EVENTS_VS_DISPLAY_MANOEUVRES; DEGRADED excluded from clean manoeuvre claims',
        },
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify({ out: OUT, totalEvents, matched, degraded, b0Total }, null, 2),
  );
}

main();
