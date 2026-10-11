import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateR9DefinitionHealth,
  parseSubscriberList,
  classifyDimoApiError,
  evaluatePublicHealthGet,
} from './r9-r25-circuit-monitor.lib.mjs';

describe('r9-r25-circuit-monitor.lib', () => {
  it('passes healthy enabled zero-failure cohort', () => {
    const r = evaluateR9DefinitionHealth(
      { status: 'enabled', failureCount: 0 },
      [186946, 187361, 187784, 192922],
    );
    assert.equal(r.healthy, true);
  });

  it('dedupes subscribers', () => {
    const p = parseSubscriberList([
      'did:erc721:137:0xabc:186946',
      'did:erc721:137:0xabc:186946',
    ]);
    assert.equal(p.tokenIds.length, 1);
  });

  it('classifies auth errors', () => {
    const c = classifyDimoApiError({ response: { status: 401 } });
    assert.equal(c.state, 'AUTH_ERROR');
  });

  it('public health get only', () => {
    assert.equal(evaluatePublicHealthGet(200).ok, true);
    assert.equal(evaluatePublicHealthGet(503).ok, false);
  });
});
