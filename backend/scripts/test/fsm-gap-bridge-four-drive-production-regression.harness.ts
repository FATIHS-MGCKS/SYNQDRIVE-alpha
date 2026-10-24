#!/usr/bin/env npx ts-node --transpile-only
/**
 * Offline four-drive FSM gap-bridge regression (native V0.4 FSM + DI-V0 aux).
 * Requires research inputs under DS4_FSM_GAP_BRIDGE_EVAL_ROOT (see REPRO.md).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const CODE_ROOT = process.env.SYNQDRIVE_REPO_ROOT ?? path.join(process.cwd(), '..');
const EVAL_ROOT =
  process.env.DS4_FSM_GAP_BRIDGE_EVAL_ROOT ??
  path.join(
    CODE_ROOT,
    'research/driving-intelligence/evaluations/ds4-fsm-retrospective-gap-bridge-research-20261023',
  );
const REF_EVAL =
  process.env.DS4_ACCEL_BRAKE_REF_ROOT ??
  path.join(CODE_ROOT, '.worktrees/ds4-speed-ref/research/driving-intelligence/evaluations/ds4-accel-brake-video-reference-20261023');

const summaryPath = path.join(EVAL_ROOT, 'outputs/run_v2_native_fsm/summary.json');
if (!fs.existsSync(summaryPath)) {
  console.error('Missing sealed summary:', summaryPath);
  process.exit(2);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as {
  drives: Record<
    string,
    {
      candidate: { fsmStateCounts: { UNKNOWN: number } };
      delta: { falseMotion: number; falseStill: number };
    }
  >;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bridge = require(path.join(EVAL_ROOT, 'scripts/drive_loaders_bridge.cjs')) as {
  loadAllDrives: (opts: {
    codeRoot: string;
    refEvalRoot: string;
    L: unknown;
    core: unknown;
    processDiV0MotionCoreShadowTrip: unknown;
  }) => Array<{ id: string }>;
};

const req = (rel: string) =>
  require(path.join(CODE_ROOT, 'backend/src/modules/vehicle-intelligence/driving-intelligence', rel));

const core = req('core/index.ts');
const L = require(path.join(REF_EVAL, 'scripts/replay_event_eval.cjs'));
const { processDiV0MotionCoreShadowTrip } = req('motion-core-shadow-worker/di-v0-motion-core-shadow-processor.ts');

let failed = 0;
for (const d of bridge.loadAllDrives({ codeRoot: CODE_ROOT, refEvalRoot: REF_EVAL, L, core, processDiV0MotionCoreShadowTrip })) {
  const row = summary.drives[d.id];
  if (!row) {
    console.error('missing summary row', d.id);
    failed += 1;
    continue;
  }
  if (row.delta.falseMotion !== 0 || row.delta.falseStill !== 0) {
    console.error('scoring delta', d.id, row.delta);
    failed += 1;
  }
  console.log(d.id, 'UNKNOWN baseline→candidate', summary.drives[d.id].candidate.fsmStateCounts.UNKNOWN);
}

const tig = summary.drives.TIG22;
if (tig?.candidate?.fsmStateCounts?.UNKNOWN !== 68) {
  console.error('TIG22 UNKNOWN expected 68 got', tig?.candidate?.fsmStateCounts?.UNKNOWN);
  failed += 1;
}

process.exit(failed ? 1 : 0);
