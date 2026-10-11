import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateR9DefinitionHealth,
  parseSubscriberList,
  classifyDimoApiError,
  evaluatePublicHealthGet,
  R9_DEFINITION_CONTRACTS,
} from './r9-r25-circuit-monitor.lib.mjs';
import { enforceMonitorRateLimit } from './r9-r25-circuit-monitor-rate.lib.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';

const cohort = [186946, 187361, 187784, 192922];

describe('r9-r25-circuit-monitor.lib', () => {
  it('passes healthy enabled zero-failure cohort with contract', () => {
    const def = {
      status: 'enabled',
      failureCount: 0,
      ...R9_DEFINITION_CONTRACTS.speed,
    };
    const r = evaluateR9DefinitionHealth(def, cohort, R9_DEFINITION_CONTRACTS.speed);
    assert.equal(r.healthy, true);
  });

  it('fails on missing failureCount', () => {
    const r = evaluateR9DefinitionHealth({ status: 'enabled' }, cohort, R9_DEFINITION_CONTRACTS.speed);
    assert.equal(r.healthy, false);
    assert.ok(r.alerts.some((a) => a.code === 'FAILURE_COUNT_UNKNOWN'));
  });

  it('fails on unparseable DID', () => {
    const p = parseSubscriberList(['not-a-did']);
    assert.equal(p.ok, false);
    assert.equal(p.error, 'SUBSCRIBER_DID_UNPARSEABLE');
  });

  it('fails on extra subscriber', () => {
    const r = evaluateR9DefinitionHealth(
      { status: 'enabled', failureCount: 0, ...R9_DEFINITION_CONTRACTS.speed },
      [...cohort, 999999],
      R9_DEFINITION_CONTRACTS.speed,
    );
    assert.equal(r.healthy, false);
  });

  it('fails when excluded 187336 subscribed', () => {
    const r = evaluateR9DefinitionHealth(
      { status: 'enabled', failureCount: 0, ...R9_DEFINITION_CONTRACTS.speed },
      [...cohort, 187336],
      R9_DEFINITION_CONTRACTS.speed,
    );
    assert.ok(r.alerts.some((a) => a.code === 'EXCLUDED_TOKEN_SUBSCRIBED'));
  });

  it('dedupes subscribers', () => {
    const p = parseSubscriberList([
      'did:erc721:137:0xabc:186946',
      'did:erc721:137:0xabc:186946',
    ]);
    assert.equal(p.tokenIds.length, 1);
  });

  it('classifies auth timeout 5xx 429', () => {
    assert.equal(classifyDimoApiError({ response: { status: 401 } }).state, 'AUTH_ERROR');
    assert.equal(classifyDimoApiError({ response: { status: 403 } }).state, 'AUTH_ERROR');
    assert.equal(classifyDimoApiError({ response: { status: 429 } }).state, 'RATE_LIMIT');
    assert.equal(classifyDimoApiError({ response: { status: 502 } }).state, 'PROVIDER_5XX');
    assert.equal(classifyDimoApiError({ code: 'ETIMEDOUT' }).state, 'TIMEOUT');
  });

  it('redacts bearer tokens in error messages', () => {
    const c = classifyDimoApiError({ message: 'bad Bearer eyJhbGciOiJIUzI1NiJ9.x' });
    assert.ok(!c.message.includes('eyJ'));
  });

  it('public health get only', () => {
    assert.equal(evaluatePublicHealthGet(200).ok, true);
    assert.equal(evaluatePublicHealthGet(503).ok, false);
  });

  it('enforces local rate limit', () => {
    const state = path.join(os.tmpdir(), `r9-rate-${Date.now()}.json`);
    const first = enforceMonitorRateLimit(state, 60_000);
    assert.equal(first.ok, true);
    const second = enforceMonitorRateLimit(state, 60_000);
    assert.equal(second.ok, false);
    fs.unlinkSync(state);
  });
});
