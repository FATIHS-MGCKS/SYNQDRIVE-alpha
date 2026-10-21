/**
 * EXP021 motion core TS step 1 — offline report (no production I/O).
 * cd backend && npx ts-node --transpile-only scripts/test/motion-core-ts-step1.harness.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  countFrozenL3ShadowMismatches,
  detectTimingJitterSuspectLegs,
  MOTION_CORE_JITTER_NEIGHBOUR_OFFSETS_S,
  MOTION_CORE_LEG_CONSISTENCY_VERSION,
  replayFrozenL3OnGrid,
  summarizeFrozenL3Replay,
  type MotionCorePositionBucket,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/core';

const OUT = process.env.MOTION_CORE_TS_STEP1_OUT ?? '/opt/cursor/artifacts/exp021-motion-core-ts-step1';
const PHASE5C =
  process.env.EXP021_PHASE5C_ROOT ?? '/opt/cursor/artifacts/exp021-phase5c-tesla-reference-20261021';

const TRIPS = [
  { key: 'TRIP_1', tripId: '14c41c06-0a54-49d1-b5d2-f9d7373e638d' },
  { key: 'TRIP_2', tripId: '7a9d6a28-d91a-4919-98d8-d92fbea1573e' },
];

function loadGrid(tripKey: string): MotionCorePositionBucket[] {
  const p = path.join(PHASE5C, 'replay', `${tripKey}_position_grid.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8')).buckets as MotionCorePositionBucket[];
}

function loadShadow(tripKey: string): Map<string, number | null> {
  const p = path.join(PHASE5C, 'telemetry/production_export/shadow', `${tripKey}_shadow_intervals.jsonl`);
  const map = new Map<string, number | null>();
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { intervalStart: string; estimatedSpeedKmh: number | null };
    const label = new Date(row.intervalStart).toISOString().replace(/\.\d{3}Z$/, 'Z');
    map.set(label, row.estimatedSpeedKmh);
  }
  return map;
}

function main(): void {
  fs.mkdirSync(OUT, { recursive: true });
  const report: Record<string, unknown> = {
    generatedUtc: new Date().toISOString(),
    legConsistencyVersion: MOTION_CORE_LEG_CONSISTENCY_VERSION,
    jitterNeighbourOffsetsS: MOTION_CORE_JITTER_NEIGHBOUR_OFFSETS_S,
    lookaheadNote:
      'Timing-jitter signature uses centered neighbour legs ±3 s; not causal. Truncated streams may omit signatures until future labels arrive.',
    trips: [] as unknown[],
  };

  for (const trip of TRIPS) {
    const grid = loadGrid(trip.key);
    const shadow = loadShadow(trip.key);
    const replay = replayFrozenL3OnGrid(grid);
    const mism = countFrozenL3ShadowMismatches(replay, shadow, 0.05);
    const jitter = [...detectTimingJitterSuspectLegs(grid).entries()].map(([leg, detail]) => ({
      legStartLabel: leg,
      ...detail,
    }));
    (report.trips as unknown[]).push({
      tripKey: trip.key,
      tripId: trip.tripId,
      baselineShadowMismatches: mism,
      replaySummary: summarizeFrozenL3Replay(replay),
      jitterLegCount: jitter.length,
      jitterLegs: jitter,
    });
  }

  fs.writeFileSync(path.join(OUT, 'STEP1_REPORT.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(OUT, 'LOOKAHEAD.md'),
    `# Lookahead — leg consistency (step 1)

- **Frozen L3 at label t** needs calendar support at **t−1, t, t+1** (existing \`evaluateL3AtCenter\`).
- **Timing-jitter signature** on leg starting at **t** inspects neighbouring 1 s legs at offsets **${MOTION_CORE_JITTER_NEIGHBOUR_OFFSETS_S.join(', ')}** seconds relative to **t**.
- Maximum label-axis lookahead for jitter diagnosis: **3 s** after the leg start (leg t→t+1 still needs endpoint at t+1).
- Assessments are **centered diagnostics**; do not treat them as zero-latency causal outputs in live mode.
`,
  );
  console.log(JSON.stringify({ out: OUT, trips: (report.trips as unknown[]).length }, null, 2));
}

main();
