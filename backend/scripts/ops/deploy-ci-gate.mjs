/**
 * Mandatory CI gate check before production deploy (aggregate critical jobs).
 */
import { execFileSync } from 'node:child_process';

const DEFAULT_REPO = 'FATIHS-MGCKS/SYNQDRIVE-alpha';
const CRITICAL_GATE_NAME = 'CI gate (all critical jobs)';

/**
 * @param {unknown} sha
 */
export function isValidFullGitSha(sha) {
  return typeof sha === 'string' && /^[0-9a-fA-F]{40}$/.test(sha);
}

/**
 * @param {string} sha
 * @param {{ repo?: string; ghBin?: string }} [opts]
 * @returns {{ ok: true } | { ok: false; reason: string; detail?: string }}
 */
export function assertCriticalCiGatePassed(sha, opts = {}) {
  if (!isValidFullGitSha(sha)) {
    return { ok: false, reason: 'invalid_sha' };
  }
  const repo = opts.repo ?? DEFAULT_REPO;
  const gh = opts.ghBin ?? 'gh';
  let raw;
  try {
    raw = execFileSync(
      gh,
      ['api', `repos/${repo}/commits/${sha}/check-runs`, '--jq', '.check_runs'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'gh_api_failed', detail: message };
  }

  let runs;
  try {
    runs = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'gh_api_invalid_json' };
  }
  if (!Array.isArray(runs)) {
    return { ok: false, reason: 'gh_api_unexpected_shape' };
  }

  const matches = runs.filter((r) => r && r.name === CRITICAL_GATE_NAME);
  if (matches.length === 0) {
    return { ok: false, reason: 'critical_gate_check_run_missing' };
  }
  const success = matches.some((r) => r.conclusion === 'success' && r.status === 'completed');
  if (!success) {
    const conclusions = matches.map((r) => `${r.conclusion ?? 'null'}/${r.status ?? 'null'}`).join(',');
    return { ok: false, reason: 'critical_gate_not_success', detail: conclusions };
  }
  return { ok: true };
}

const isCli =
  typeof process.argv[1] === 'string' && process.argv[1].replace(/\\/g, '/').endsWith('deploy-ci-gate.mjs');
if (isCli) {
  const sha = process.argv[2];
  const result = assertCriticalCiGatePassed(sha);
  if (!result.ok) {
    console.error(`CI_GATE_FAIL reason=${result.reason}${result.detail ? ` detail=${result.detail}` : ''}`);
    process.exit(1);
  }
  console.log(`CI_GATE_PASS sha=${sha.slice(0, 12)} gate=${CRITICAL_GATE_NAME}`);
}
