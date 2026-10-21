import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertValidDeploySha,
  findDuplicateMachineKeys,
  isValidFullGitSha,
  validateSkipPreflightContract,
} from './deploy-sha-provenance.mjs';

const VALID = '3772d992dae012bc9d794184e05e8ad39db09df4';

test('CASE H: skip preflight without requested SHA fails closed', () => {
  const r = validateSkipPreflightContract({ skipPreflight: true, requestedSha: null });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'skip_preflight_requires_explicit_requested_sha');
});

test('CASE I: skip preflight with valid explicit SHA accepted', () => {
  assert.equal(isValidFullGitSha(VALID), true);
  const r = assertValidDeploySha(VALID);
  assert.equal(r.ok, true);
  assert.equal(r.sha, VALID);

  const skip = validateSkipPreflightContract({ skipPreflight: true, requestedSha: VALID });
  assert.equal(skip.ok, true);
  assert.equal(skip.requestedSha, VALID);
});

test('CASE J: malformed requested SHA rejected', () => {
  for (const bad of ['abc', '3772d99', '', null, 'g'.repeat(40)]) {
    const r = assertValidDeploySha(bad);
    assert.equal(r.ok, false, `expected reject: ${String(bad)}`);
  }
});

test('CASE K: shell metacharacters rejected', () => {
  const r = assertValidDeploySha(`${VALID};rm`);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'requested_sha_contains_shell_metacharacters');

  const r2 = assertValidDeploySha('3772d992dae012bc9d794184e05e8ad39db09df4$(id)');
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'requested_sha_contains_shell_metacharacters');
});

test('CASE L: duplicate machine keys detected', () => {
  const dupes = findDuplicateMachineKeys(['FOO', 'BAR', 'FOO']);
  assert.deepEqual(dupes, ['FOO']);
});
