/**
 * Mandatory CI gate check before production deploy (aggregate critical jobs).
 * Canonical gate: Vehicle Detail production-readiness workflow on the exact deploy SHA.
 */
import { execFileSync } from 'node:child_process';

const DEFAULT_REPO = 'FATIHS-MGCKS/SYNQDRIVE-alpha';
export const CRITICAL_GATE_NAME = 'CI gate (all critical jobs)';
export const CANONICAL_DEPLOY_GATE_WORKFLOW_PATH =
  '.github/workflows/vehicle-detail-production-readiness.yml';

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
 * @param {unknown} detailsUrl
 * @returns {string | null}
 */
export function parseGithubActionsRunIdFromDetailsUrl(detailsUrl) {
  if (typeof detailsUrl !== 'string' || !detailsUrl) {
    return null;
  }
  const match = detailsUrl.match(/\/actions\/runs\/(\d+)(?:\/|$)/);
  return match ? match[1] : null;
}

/**
 * @param {string} runId
 * @param {{ repo?: string; ghBin?: string; execFileSync?: typeof import('node:child_process').execFileSync; workflowPathByRunId?: Record<string, string | null> }} [opts]
 * @returns {string | null}
 */
export function fetchWorkflowPathForActionsRunId(runId, opts = {}) {
  if (!runId) {
    return null;
  }
  const map = opts.workflowPathByRunId;
  if (map && Object.prototype.hasOwnProperty.call(map, runId)) {
    const mapped = map[runId];
    return typeof mapped === 'string' ? mapped : null;
  }
  const repo = opts.repo ?? DEFAULT_REPO;
  const gh = opts.ghBin ?? 'gh';
  const runGh = opts.execFileSync ?? execFileSync;
  try {
    const raw = runGh(
      gh,
      ['api', `repos/${repo}/actions/runs/${runId}`, '--jq', '.path'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const path = String(raw).trim();
    return path || null;
  } catch {
    return null;
  }
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
 * @param {Array<Record<string, unknown>>} canonicalRuns
 * @returns {Record<string, unknown> | null}
 */
export function selectLatestCanonicalGateRun(canonicalRuns) {
  if (!Array.isArray(canonicalRuns) || canonicalRuns.length === 0) {
    return null;
  }
  let latest = canonicalRuns[0];
  let latestKey = checkRunSortKey(latest.completed_at) || checkRunSortKey(latest.started_at);
  for (const run of canonicalRuns.slice(1)) {
    const key = checkRunSortKey(run.completed_at) || checkRunSortKey(run.started_at);
    if (key >= latestKey) {
      latest = run;
      latestKey = key;
    }
  }
  return latest;
}

/**
 * @param {Array<Record<string, unknown>>} runs
 * @param {{
 *   gateName?: string;
 *   canonicalWorkflowPath?: string;
 *   resolveWorkflowPathForRunId?: (runId: string, run: Record<string, unknown>) => string | null;
 *   repo?: string;
 *   ghBin?: string;
 *   execFileSync?: typeof import('node:child_process').execFileSync;
 *   workflowPathByRunId?: Record<string, string | null>;
 * }} [opts]
 * @returns {{ ok: true; latest: Record<string, unknown> } | { ok: false; reason: string; detail?: string }}
 */
export function evaluateCriticalGateFromCheckRuns(runs, opts = {}) {
  const gateName = opts.gateName ?? CRITICAL_GATE_NAME;
  const canonicalPath = opts.canonicalWorkflowPath ?? CANONICAL_DEPLOY_GATE_WORKFLOW_PATH;
  const resolvePath =
    opts.resolveWorkflowPathForRunId ??
    ((runId) => fetchWorkflowPathForActionsRunId(runId, opts));

  if (!Array.isArray(runs)) {
    return { ok: false, reason: 'check_runs_not_array' };
  }

  const gateRuns = runs.filter((run) => run && run.name === gateName);
  if (gateRuns.length === 0) {
    return { ok: false, reason: 'critical_gate_check_run_missing' };
  }

  const canonicalRuns = [];
  let sawUnverifiableGateRun = false;

  for (const run of gateRuns) {
    const runId = parseGithubActionsRunIdFromDetailsUrl(run.details_url);
    if (!runId) {
      sawUnverifiableGateRun = true;
      continue;
    }
    const workflowPath = resolvePath(runId, run);
    if (!workflowPath) {
      sawUnverifiableGateRun = true;
      continue;
    }
    if (workflowPath === canonicalPath) {
      canonicalRuns.push(run);
    }
  }

  if (canonicalRuns.length === 0) {
    if (sawUnverifiableGateRun) {
      return {
        ok: false,
        reason: 'canonical_gate_workflow_identity_unverifiable',
      };
    }
    return { ok: false, reason: 'critical_gate_check_run_missing' };
  }

  const latest = selectLatestCanonicalGateRun(canonicalRuns);
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
 * @param {string} repo
 * @param {string} sha
 * @param {number} page
 * @param {number} [perPage]
 */
export function buildCommitCheckRunsApiEndpoint(repo, sha, page, perPage = 100) {
  return `repos/${repo}/commits/${sha}/check-runs?per_page=${perPage}&page=${page}`;
}

/**
 * @param {string} sha
 * @param {{ repo?: string; ghBin?: string; execFileSync?: typeof import('node:child_process').execFileSync; workflowPathByRunId?: Record<string, string | null> }} [opts]
 * @returns {Array<Record<string, unknown>>}
 */
export function fetchAllCheckRunsForCommit(sha, opts = {}) {
  const repo = opts.repo ?? DEFAULT_REPO;
  const gh = opts.ghBin ?? 'gh';
  const runGh = opts.execFileSync ?? execFileSync;
  const all = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const endpoint = buildCommitCheckRunsApiEndpoint(repo, sha, page, perPage);
    const raw = runGh(
      gh,
      ['api', endpoint],
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
 * @param {{ repo?: string; ghBin?: string; execFileSync?: typeof import('node:child_process').execFileSync; workflowPathByRunId?: Record<string, string | null> }} [opts]
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
  return evaluateCriticalGateFromCheckRuns(runs, opts);
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
