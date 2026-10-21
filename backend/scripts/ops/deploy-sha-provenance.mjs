/**
 * Exact-SHA deploy provenance helpers (DEC-016).
 */

const FULL_GIT_SHA_RE = /^[0-9a-fA-F]{40}$/;

/**
 * @param {unknown} sha
 */
export function isValidFullGitSha(sha) {
  return typeof sha === 'string' && FULL_GIT_SHA_RE.test(sha);
}

/**
 * @param {unknown} sha
 * @returns {{ ok: true; sha: string } | { ok: false; reason: string }}
 */
export function assertValidDeploySha(sha) {
  if (sha == null || sha === '') {
    return { ok: false, reason: 'missing_requested_sha' };
  }
  if (typeof sha !== 'string') {
    return { ok: false, reason: 'invalid_requested_sha_type' };
  }
  if (/\s/.test(sha)) {
    return { ok: false, reason: 'requested_sha_contains_whitespace' };
  }
  if (/[;&|`$(){}[\]<>\\'"!#*?]/.test(sha)) {
    return { ok: false, reason: 'requested_sha_contains_shell_metacharacters' };
  }
  if (!FULL_GIT_SHA_RE.test(sha)) {
    return { ok: false, reason: 'requested_sha_malformed' };
  }
  return { ok: true, sha: sha.toLowerCase() };
}

/**
 * Skip-preflight contract: explicit pinned SHA required; never auto-resolve.
 *
 * @param {{ skipPreflight?: boolean; requestedSha?: string | null }} input
 */
export function validateSkipPreflightContract({ skipPreflight = false, requestedSha = null } = {}) {
  if (!skipPreflight) {
    return { ok: true, reason: 'preflight_required' };
  }
  const shaResult = assertValidDeploySha(requestedSha);
  if (!shaResult.ok) {
    return {
      ok: false,
      reason: 'skip_preflight_requires_explicit_requested_sha',
      detail: shaResult.reason,
    };
  }
  return { ok: true, reason: 'skip_preflight_explicit_sha', requestedSha: shaResult.sha };
}

/**
 * @param {string[]} keyList
 */
export function findDuplicateMachineKeys(keyList) {
  const seen = new Map();
  const duplicates = [];
  for (const key of keyList) {
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count === 2) {
      duplicates.push(key);
    }
  }
  return duplicates;
}
