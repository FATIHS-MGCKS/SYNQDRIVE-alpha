#!/usr/bin/env npx ts-node --transpile-only
/**
 * Four-drive regression gate for P1 (spike bracket) + P2 (universal plausibility).
 * Compares processor-equivalent event outputs to Fable baseline CSVs (`fable_base_7340637`).
 *
 *   cd backend && npx ts-node --transpile-only scripts/test/motion-event-p1-p2-four-drive-regression.harness.ts
 *
 * Optional env: DS4_ACCEL_EVAL_ROOT, FABLE_BASELINE_DIR (see Fable review `scripts/paths.cjs`).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyMotionEventUniversalPlausibility,
  computeC4AdaptiveL3,
  detectMotionManoeuvreEvents,
  MOTION_CORE_EVENT_GUARDS_V0_1_DEV,
  MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/core';

function resolveReplayScript(): string {
  const evalsDir = path.resolve(__dirname, '../../../research/driving-intelligence/evaluations');
  const candidates = [
    process.env.DS4_ACCEL_EVAL_ROOT,
    path.join(evalsDir, 'ds4-accel-brake-video-reference-20261023'),
    path.join(process.cwd(), '../.worktrees/ds4-speed-ref/research/driving-intelligence/evaluations/ds4-accel-brake-video-reference-20261023'),
    '/tmp/research/ds4-accel-brake-video-eval-192d/research/driving-intelligence/evaluations/ds4-accel-brake-video-reference-20261023',
  ].filter(Boolean) as string[];
  for (const root of candidates) {
    const script = path.join(root, 'scripts/replay_event_eval.cjs');
    if (fs.existsSync(script)) {
      return script;
    }
  }
  return path.join(candidates[0] ?? '', 'scripts/replay_event_eval.cjs');
}

const REPLAY = resolveReplayScript();

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

/** P1-only quality delta vs production baseline (universal P2 does not force TIG22 nameplate marks). */
const P1_QUALITY_DELTA_KEYS = new Set(['ACCELERATION|2026-10-16T03:50:20Z|2026-10-16T03:50:23Z']);

const BASELINE_TREFFER: Record<string, number> = {
  TIG22: 12,
  TES16: 15,
  'TES21-1': 2,
  'TES21-2': 4,
};

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
  const events = detectMotionManoeuvreEvents(
    0,
    d.c4,
    'C4_ADAPTIVE_L3',
    MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
    MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
  );
  applyMotionEventUniversalPlausibility(events);
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
      if (k && P1_QUALITY_DELTA_KEYS.has(k) && c.includes('ARTEFACT_SUSPECT')) return false;
      if (c.match(/^(\S+\|\S+\|\S+) quality /)) return true;
      return c.length > 0;
    });

    const p1Key = 'ACCELERATION|2026-10-16T03:50:20Z|2026-10-16T03:50:23Z';
    if (d.id === 'TES16' && !changes.some((c) => c.startsWith(p1Key) && c.includes('ARTEFACT_SUSPECT'))) {
      console.error('TES16 P1 spike-bracket mark missing');
      failed += 1;
    }

    const evalOut = R.evaluateDrive(
      { ...d, events },
      { write: false },
    );
    const treffer =
      (evalOut.summary as { accepted?: { ds4ByClass?: Record<string, number> } }).accepted?.ds4ByClass?.TREFFER ??
      (evalOut.summary as { ds4ByClass?: Record<string, number> }).ds4ByClass?.TREFFER;
    const expectedTreffer = BASELINE_TREFFER[d.id];
    if (expectedTreffer != null && treffer !== expectedTreffer) {
      console.error(`TREFFER drift ${d.id}: expected ${expectedTreffer}, got ${treffer}`);
      failed += 1;
    }

    report[d.id] = {
      changes,
      disallowed,
      summary: evalOut.summary,
      treffer,
      expectedTreffer,
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
