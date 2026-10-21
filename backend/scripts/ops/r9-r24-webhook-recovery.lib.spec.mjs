import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  R9_SPEED_ID,
  resolveExecutionMode,
  cohortMatches,
  parseCliArgs,
} from './r9-r24-webhook-recovery.lib.mjs';

describe('r9-r24-webhook-recovery.lib', () => {
  it('defaults to read-only', () => {
    const m = resolveExecutionMode(parseCliArgs([]));
    assert.equal(m.authorized, false);
  });

  it('requires allowlisted confirm uuid', () => {
    const m = resolveExecutionMode(
      parseCliArgs(['--execute', '--confirm-webhook=00000000-0000-0000-0000-000000000000']),
    );
    assert.equal(m.authorized, false);
  });

  it('authorizes speed uuid with execute', () => {
    const m = resolveExecutionMode(parseCliArgs(['--execute', `--confirm-webhook=${R9_SPEED_ID}`]));
    assert.equal(m.authorized, true);
    assert.equal(m.webhookId, R9_SPEED_ID);
  });

  it('cohort matcher accepts four R9 vehicles only', () => {
    assert.equal(cohortMatches([186946, 187361, 187784, 192922]), true);
    assert.equal(cohortMatches([186946, 187336, 187784, 192922]), false);
  });
});
