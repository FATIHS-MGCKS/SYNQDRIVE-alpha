import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIsolatedCliArgs,
  resolveIsolatedExecutionMode,
  CANARY_CONFIRM_VALUE,
} from './gt-r1-plug-webhook-canary-isolated.lib.mjs';

describe('gt-r1-plug-webhook-canary-isolated CLI gate', () => {
  it('defaults to READ_ONLY inspect', () => {
    const parsed = parseIsolatedCliArgs([]);
    const mode = resolveIsolatedExecutionMode(parsed);
    assert.equal(mode.mode, 'READ_ONLY');
    assert.equal(parsed.phase, 'inspect');
  });

  it('dry-run plan stays read-only', () => {
    const parsed = parseIsolatedCliArgs(['--dry-run-plan', '--phase=activate']);
    const mode = resolveIsolatedExecutionMode(parsed);
    assert.equal(mode.mode, 'READ_ONLY');
    assert.equal(mode.reason, 'dry_run_plan_only');
  });

  it('authorize activate only with execute + confirm + phase + canary', () => {
    const parsed = parseIsolatedCliArgs([
      '--execute',
      '--phase=activate',
      '--canary=WOB_L_7503',
      `--confirm-canary=${CANARY_CONFIRM_VALUE}`,
    ]);
    const mode = resolveIsolatedExecutionMode(parsed);
    assert.equal(mode.mode, 'AUTHORIZED_MUTATION');
    assert.equal(mode.authorized, true);
  });

  it('inspect phase never authorizes mutation even with execute', () => {
    const parsed = parseIsolatedCliArgs(['--execute', `--confirm-canary=${CANARY_CONFIRM_VALUE}`]);
    const mode = resolveIsolatedExecutionMode(parsed);
    assert.equal(mode.authorized, false);
    assert.equal(mode.reason, 'inspect_phase_no_mutation');
  });
});
