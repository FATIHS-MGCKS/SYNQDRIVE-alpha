'use strict';
/**
 * Path resolution for the Fable accel/brake review harness (research-only, read-only).
 *
 * Upstream inputs are NOT duplicated here (see README "Upstream input dependencies"):
 *   - PR #2139 tree  `ds4-accel-brake-video-reference-20261023/` (replay_event_eval.cjs, event_eval_lib.cjs, inputs)
 *   - PR #2136 tree  `ds4-speed-video-reference-20261023/` (eval_lib.cjs)
 *
 * Resolution order for the PR #2139 evaluation root:
 *   1. env DS4_ACCEL_EVAL_ROOT
 *   2. sibling directory in this repository (after #2139 merges)
 *   3. detached worktree /tmp/research/ds4-accel-brake-video-eval-192d (how this review was run)
 *
 * The production code root is passed to the underlying replay via `--code-root <checkout>` and is
 * re-used here for direct `.ts` requires (ts-node is registered by replay_event_eval.cjs).
 */
const fs = require('node:fs');
const path = require('node:path');

const evalsDir = path.resolve(__dirname, '..', '..');
const candidates = [
  process.env.DS4_ACCEL_EVAL_ROOT,
  path.join(evalsDir, 'ds4-accel-brake-video-reference-20261023'),
  '/tmp/research/ds4-accel-brake-video-eval-192d/research/driving-intelligence/evaluations/ds4-accel-brake-video-reference-20261023',
].filter(Boolean);
const accelEvalRoot = candidates.find((p) => fs.existsSync(path.join(p, 'scripts', 'replay_event_eval.cjs')));
if (!accelEvalRoot) {
  throw new Error(
    `PR #2139 evaluation root not found. Set DS4_ACCEL_EVAL_ROOT or check out origin/cursor/ds4-accel-brake-video-eval-192d. Tried:\n${candidates.join('\n')}`,
  );
}
const speedEvalRoot = path.resolve(accelEvalRoot, '..', 'ds4-speed-video-reference-20261023');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const codeRoot = path.resolve(opt('--code-root', path.resolve(evalsDir, '..', '..', '..')));
const DI = path.join(codeRoot, 'backend/src/modules/vehicle-intelligence/driving-intelligence');
const outRoot = path.resolve(opt('--out', path.join(__dirname, '..', 'outputs', 'ab')));

module.exports = {
  accelEvalRoot,
  speedEvalRoot,
  replayScript: path.join(accelEvalRoot, 'scripts', 'replay_event_eval.cjs'),
  eventEvalLib: path.join(accelEvalRoot, 'scripts', 'event_eval_lib.cjs'),
  evalLib: path.join(speedEvalRoot, 'scripts', 'eval_lib.cjs'),
  codeRoot,
  DI,
  outRoot,
};
