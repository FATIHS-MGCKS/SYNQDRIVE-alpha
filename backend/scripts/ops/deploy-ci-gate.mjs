/**
 * Mandatory CI gate check before production deploy (aggregate critical jobs).
 * Uses latest check run per name (by completed_at, else started_at) across all API pages.
 */
import { execFileSync } from 'node:child_process';

const DEFAULT_REPO = 'FATIHS-MGCKS/SYNQDRIVE-alpha';
export const CRITICAL_GATE_NAME = 'CI gate (all critical jobs)';

/**
 * @param {unknown} sha
 */
export function isValidFullGitSha(sha) {
  return typeof sha === 'string' && /^[0-9a-fA-F]{40}$/.test(sha);
}

/**
 * @param {string | null | undefined} iso
 */
export function checkRunSortKey(iso) {
  if (!iso || typeof iso !== 'string') {
    return 0;
  }
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * @param {Array<Record<string, unknown>>} runs
 * @returns {Map<string, Record<string, unknown>>}
 */
export function latestCheckRunPerName(runs) {
  const byName = new Map();
  for (const run of runs) {
    if (!run || typeof run.name !== 'string') {
      continue;
    }
    const key = checkRunSortKey(run.completed_at) || checkRunSortKey(run.started_at);
    const prev = byName.get(run.name);
    if (!prev || key >= prev.__sortKey) {
      byName.set(run.name, { ...run, __sortKey: key });
    }
  }
  return byName;
}

/**
 * @param {Array<Record<string, unknown>>} runs
 * @param {string} [gateName]
 * @returns {{ ok: true; latest: Record<string, unknown> } | { ok: false; reason: string; detail?: string }}
 */
export function evaluateCriticalGateFromCheckRuns(runs, gateName = CRITICAL_GATE_NAME) {
  if (!Array.isArray(runs)) {
    return { ok: false, reason: 'check_runs_not_array' };
  }
  const latestByName = latestCheckRunPerName(runs);
  const latest = latestByName.get(gateName);
  if (!latest) {
    return { ok: false, reason: 'critical_gate_check_run_missing' };
  }

  const status = latest.status;
  const conclusion = latest.conclusion;

  if (status !== 'completed') {
    return {
      ok: false,
      reason: 'critical_gate_not_completed',
      detail: `${conclusion ?? 'null'}/${status ?? 'null'}`,
    };
  }

  if (conclusion === 'success') {
    return { ok: true, latest };
  }

  return {
    ok: false,
    reason: 'critical_gate_not_success',
    detail: `${conclusion ?? 'null'}/${status ?? 'null'}`,
  };
}

/**
 * @param {string} sha
 * @param {{ repo?: string; ghBin?: string }} [opts]
 * @returns {Array<Record<string, unknown>>}
 */
export function fetchAllCheckRunsForCommit(sha, opts = {}) {
  const repo = opts.repo ?? DEFAULT_REPO;
  const gh = opts.ghBin ?? 'gh';
  const all = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const raw = execFileSync(
      gh,
      [
        'api',
        `repos/${repo}/commits/${sha}/check-runs`,
        '-f',
        `per_page=${perPage}`,
        '-f',
        `page=${page}`,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const payload = JSON.parse(raw);
    const batch = Array.isArray(payload.check_runs) ? payload.check_runs : [];
    all.push(...batch);
    const total = typeof payload.total_count === 'number' ? payload.total_count : all.length;
    if (batch.length === 0 || all.length >= total) {
      break;
    }
    page += 1;
  }

  return all;
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
  let runs;
  try {
    runs = fetchAllCheckRunsForCommit(sha, opts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'gh_api_failed', detail: message };
  }
  return evaluateCriticalGateFromCheckRuns(runs);
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
