import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateR9DefinitionHealth } from './r9-r25-circuit-monitor.lib.mjs';

describe('r9-r25-circuit-monitor.lib', () => {
  it('passes healthy enabled zero-failure cohort', () => {
    const r = evaluateR9DefinitionHealth(
      { status: 'enabled', failureCount: 0 },
      [186946, 187361, 187784, 192922],
    );
    assert.equal(r.healthy, true);
  });

  it('alerts on failed status', () => {
    const r = evaluateR9DefinitionHealth({ status: 'failed', failureCount: 3 }, [186946, 187361, 187784, 192922]);
    assert.equal(r.healthy, false);
    assert.ok(r.alerts.some((a) => a.code === 'STATUS_NOT_ENABLED'));
  });

  it('alerts when 187336 subscribed', () => {
    const r = evaluateR9DefinitionHealth({ status: 'enabled', failureCount: 0 }, [187336, 186946]);
    assert.ok(r.alerts.some((a) => a.code === 'COHORT_DRIFT' || a.code === 'EXCLUDED_TOKEN_SUBSCRIBED'));
  });
});
