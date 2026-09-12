import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCliArgs, resolveExecutionMode, UNPLUG_ID } from './gt-r1-unplug-webhook-recovery.lib.mjs';

describe('gt-r1-unplug-webhook-recovery CLI gate', () => {
  it('defaults to READ_ONLY with no args', () => {
    const parsed = parseCliArgs([]);
    const mode = resolveExecutionMode(parsed);
    assert.equal(mode.mode, 'READ_ONLY');
    assert.equal(mode.authorized, false);
    assert.equal(mode.reason, 'default_read_only');
  });

  it('stays READ_ONLY with only --execute', () => {
    const parsed = parseCliArgs(['--execute']);
    const mode = resolveExecutionMode(parsed);
    assert.equal(mode.mode, 'READ_ONLY');
    assert.equal(mode.authorized, false);
    assert.equal(mode.reason, 'missing_confirm_webhook');
  });

  it('stays READ_ONLY with only --confirm-webhook', () => {
    const parsed = parseCliArgs([`--confirm-webhook=${UNPLUG_ID}`]);
    const mode = resolveExecutionMode(parsed);
    assert.equal(mode.mode, 'READ_ONLY');
    assert.equal(mode.authorized, false);
    assert.equal(mode.reason, 'missing_execute_flag');
  });

  it('stays READ_ONLY when confirm webhook UUID mismatches', () => {
    const parsed = parseCliArgs(['--execute', '--confirm-webhook=00000000-0000-0000-0000-000000000000']);
    const mode = resolveExecutionMode(parsed);
    assert.equal(mode.mode, 'READ_ONLY');
    assert.equal(mode.authorized, false);
    assert.equal(mode.reason, 'confirm_webhook_mismatch');
  });

  it('authorizes mutation only with --execute and exact confirm webhook', () => {
    const parsed = parseCliArgs(['--execute', `--confirm-webhook=${UNPLUG_ID}`]);
    const mode = resolveExecutionMode(parsed);
    assert.equal(mode.mode, 'AUTHORIZED_MUTATION');
    assert.equal(mode.authorized, true);
  });
});
