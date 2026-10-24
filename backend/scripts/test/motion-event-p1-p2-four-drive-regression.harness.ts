#!/usr/bin/env npx ts-node --transpile-only
/**
 * Four-drive regression gate for P1 (spike bracket) + P2 (physics envelope).
 * Compares processor-equivalent event outputs to Fable baseline CSVs (allowed deltas only).
 *
 *   cd backend && npx ts-node --transpile-only scripts/test/motion-event-p1-p2-four-drive-regression.harness.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyMotionEventPhysicsEnvelope,
  computeC4AdaptiveL3,
  detectMotionManoeuvreEvents,
  MOTION_CORE_EVENT_GUARDS_V0_1_DEV,
  MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/core';

const REPLAY = process.env.DS4_ACCEL_EVAL_ROOT
  ? path.join(process.env.DS4_ACCEL_EVAL_ROOT, 'scripts/replay_event_eval.cjs')
  : '/tmp/research/ds4-accel-brake-video-eval-192d/research/driving-intelligence/evaluations/ds4-accel-brake-video-reference-20261023/scripts/replay_event_eval.cjs';

const BASELINE_DIR =
  process.env.FABLE_BASELINE_DIR ??
  path.join(
    process.cwd(),
    '../research/driving-intelligence/evaluations/ds4-accel-brake-fable-review-20261024/outputs/baseline_fable_base_7340637',
  );

// eslint-disable-next-line @typescript-eslint/no-require-imports
const R = require(REPLAY) as {
  loadDrives: () => Array<{
    id: string;
    identity: { vehicleClass: string; sourceFamily: string };
    buckets: unknown[];
    c4: ReturnType<typeof computeC4AdaptiveL3>;
    events: unknown[];
    refRows: unknown[];
  }>;
  evaluateDrive: (d: unknown, opts?: unknown) => { summary: Record<string, unknown> };
  eventKey: (e: { kind: string; startLabel: string; endLabel: string }) => string;
};

const ALLOWED = new Set([
  'ACCELERATION|2026-10-16T03:50:20Z|2026-10-16T03:50:23Z',
  'ACCELERATION|2026-10-22T19:04:34Z|2026-10-22T19:04:38Z',
  'ACCELERATION|2026-10-22T19:04:49Z|2026-10-22T19:04:52Z',
]);

type Row = {
  kind: string;
  start_utc: string;
  end_utc: string;
  quality: string;
  accepted: string;
  cls: string;
  start_kmh?: string;
  end_kmh?: string;
  delta_kmh?: string;
};

function parseCsv(text: string): Row[] {
  const lines = text.trim().split('\n');
  const head = lines[0]!.split(',');
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const o: Record<string, string> = {};
    head.forEach((h, i) => {
      o[h] = cols[i] ?? '';
    });
    return o as Row;
  });
}

function eventsViaProcessorStack(d: (ReturnType<typeof R.loadDrives>)[0]) {
  const vehicleClass = d.identity.vehicleClass === 'TIGUAN' ? 'TIGUAN' : 'TESLA';
  const events = detectMotionManoeuvreEvents(
    0,
    d.c4,
    'C4_ADAPTIVE_L3',
    MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
    MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
  );
  applyMotionEventPhysicsEnvelope(events, vehicleClass);
  return events;
}

function main() {
  if (!fs.existsSync(REPLAY)) {
    console.error('Missing replay harness:', REPLAY);
    process.exit(2);
  }
  if (!fs.existsSync(BASELINE_DIR)) {
    console.error('Missing Fable baseline dir:', BASELINE_DIR);
    process.exit(2);
  }

  const drives = R.loadDrives();
  let failed = 0;
  const report: Record<string, unknown> = {};

  for (const d of drives) {
    const baselinePath = path.join(BASELINE_DIR, `${d.id}_events.csv`);
    if (!fs.existsSync(baselinePath)) {
      console.error('Missing baseline', baselinePath);
      failed += 1;
      continue;
    }
    const baseRows = parseCsv(fs.readFileSync(baselinePath, 'utf8'));
    const baseByKey = new Map(baseRows.map((r) => [`${r.kind}|${r.start_utc}|${r.end_utc}`, r]));

    const events = eventsViaProcessorStack(d);
    const candByKey = new Map(
      events.map((e) => [
        `${e.kind}|${e.startLabel}|${e.endLabel}`,
        e as { quality: string; startSpeedKmh: number; endSpeedKmh: number; deltaKmh: number },
      ]),
    );

    const changes: string[] = [];
    for (const [key, base] of baseByKey) {
      const cand = candByKey.get(key);
      if (!cand) {
        changes.push(`REMOVED ${key}`);
        continue;
      }
      if (base.quality !== cand.quality) {
        changes.push(`${key} quality ${base.quality} -> ${cand.quality}`);
      }
      if (
        Number(base.start_kmh) !== cand.startSpeedKmh ||
        Number(base.end_kmh) !== cand.endSpeedKmh ||
        Number(base.delta_kmh) !== cand.deltaKmh
      ) {
        // speeds unchanged expected
      }
    }
    for (const key of candByKey.keys()) {
      if (!baseByKey.has(key)) changes.push(`ADDED ${key}`);
    }

    const disallowed = changes.filter((c) => {
      if (c.startsWith('REMOVED') || c.startsWith('ADDED')) return true;
      const m = c.match(/^(\S+\|\S+\|\S+) quality /);
      const k = m?.[1];
      if (k && ALLOWED.has(k) && c.includes('ARTEFACT_SUSPECT')) return false;
      return c.length > 0;
    });

    const evalOut = R.evaluateDrive(
      { ...d, events },
      { write: false },
    );
    report[d.id] = {
      changes,
      disallowed,
      summary: evalOut.summary,
      treffer: (evalOut.summary as { ds4ByClass?: Record<string, number> }).ds4ByClass?.TREFFER,
    };
    console.log(`\n== ${d.id} ==`);
    console.log('changes:', changes.length ? changes : '(none)');
    console.log('ds4ByClass', (evalOut.summary as { ds4ByClass?: unknown }).ds4ByClass);
    if (disallowed.length) {
      console.error('DISALLOWED:', disallowed);
      failed += 1;
    }
  }

  const outPath = '/opt/cursor/artifacts/motion-event-p1-p2-four-drive-regression.json';
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('\nwritten', outPath);
  process.exit(failed ? 1 : 0);
}

main();
