import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { normalizeRepoPath } from './git-diff.mjs';

/**
 * Resolve the CURRENT pull request changed-path set using GitHub-correct
 * three-dot semantics: merge-base(base, head)..head.
 *
 * Classifier Git refs are intentionally separate — never pass a classifier
 * snapshot SHA as the diff start ref.
 */

export class PrBoundaryResolutionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PrBoundaryResolutionError';
    this.details = details;
  }
}

function runGit(args, repoRoot) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function assertCommitExists(sha, repoRoot) {
  runGit(['cat-file', '-e', `${sha}^{commit}`], repoRoot);
}

function resolveFromGithubEvent(eventPath) {
  if (!eventPath || !existsSync(eventPath)) {
    return null;
  }
  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  const baseSha = event.pull_request?.base?.sha;
  const headSha = event.pull_request?.head?.sha;
  if (!baseSha || !headSha) {
    return null;
  }
  return {
    baseSha,
    headSha,
    source: 'github_event_pull_request',
    mergeCommitSha: event.pull_request?.merge_commit_sha ?? null,
    baseRef: event.pull_request?.base?.ref ?? null,
    headRef: event.pull_request?.head?.ref ?? null,
  };
}

function resolveFromEnvironment() {
  const baseSha = process.env.GITHUB_BASE_SHA || process.env.I18N_PR_BASE_SHA;
  const headSha = process.env.GITHUB_HEAD_SHA || process.env.I18N_PR_HEAD_SHA;
  if (!baseSha || !headSha) {
    return null;
  }
  return {
    baseSha,
    headSha,
    source: process.env.GITHUB_BASE_SHA ? 'github_actions_env' : 'i18n_pr_env',
    mergeCommitSha: null,
    baseRef: process.env.GITHUB_BASE_REF ?? null,
    headRef: process.env.GITHUB_HEAD_REF ?? null,
  };
}

function resolveFromGhCli(repoRoot) {
  try {
    const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);
    if (branch === 'HEAD') {
      return null;
    }
    const json = execFileSync(
      'gh',
      ['pr', 'view', '--json', 'baseRefOid,headRefOid,baseRefName,headRefName'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim();
    const pr = JSON.parse(json);
    if (!pr.baseRefOid || !pr.headRefOid) {
      return null;
    }
    return {
      baseSha: pr.baseRefOid,
      headSha: pr.headRefOid,
      source: 'gh_pr_view',
      mergeCommitSha: null,
      baseRef: pr.baseRefName ?? null,
      headRef: pr.headRefName ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve authoritative PR base/head commit SHAs.
 */
export function resolvePrBoundaryRefs(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();

  if (options.baseSha && options.headSha) {
    return {
      baseSha: options.baseSha,
      headSha: options.headSha,
      source: options.source ?? 'explicit',
      mergeCommitSha: options.mergeCommitSha ?? null,
      baseRef: options.baseRef ?? null,
      headRef: options.headRef ?? null,
    };
  }

  const fromEvent = resolveFromGithubEvent(options.eventPath ?? process.env.GITHUB_EVENT_PATH);
  if (fromEvent) {
    return fromEvent;
  }

  const fromEnv = resolveFromEnvironment();
  if (fromEnv) {
    return fromEnv;
  }

  const fromGh = resolveFromGhCli(repoRoot);
  if (fromGh) {
    return fromGh;
  }

  throw new PrBoundaryResolutionError(
    'Unable to resolve PR base/head boundary safely. Provide baseSha/headSha, run inside pull_request CI (GITHUB_EVENT_PATH), set I18N_PR_BASE_SHA/I18N_PR_HEAD_SHA, or run from a branch with an open GitHub PR (gh CLI).',
    { repoRoot },
  );
}

/**
 * Resolve the immutable CURRENT PR changed-path set once.
 * Uses GitHub three-dot diff: base...head.
 */
export function resolveEffectivePrChangedPaths(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const boundary = resolvePrBoundaryRefs({ ...options, repoRoot });

  assertCommitExists(boundary.baseSha, repoRoot);
  assertCommitExists(boundary.headSha, repoRoot);

  const raw = runGit(
    ['diff', '--name-only', `${boundary.baseSha}...${boundary.headSha}`],
    repoRoot,
  );
  const changedPaths = raw
    ? raw
        .split('\n')
        .map((path) => normalizeRepoPath(path))
        .filter(Boolean)
    : [];

  return {
    ...boundary,
    changedPaths,
  };
}

/**
 * Legacy incorrect resolver kept only for regression comparison tests.
 * Two-dot diff against a moving ref — NOT valid for PR boundary resolution.
 */
export function resolveLegacyOriginMainTwoDotPaths(repoRoot) {
  const raw = runGit(['diff', '--name-only', 'origin/main'], repoRoot);
  return raw
    ? raw
        .split('\n')
        .map((path) => normalizeRepoPath(path))
        .filter(Boolean)
    : [];
}
