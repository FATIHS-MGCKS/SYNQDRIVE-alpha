import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ENFORCEMENT_COVERAGE_CATALOG_VERSION } from './enforcement-coverage-catalog';

const WORKSPACE_ROOT = join(__dirname, '..', '..', '..', '..', '..');

export interface EnforcementCoverageVersionInfo {
  coverageVersion: string;
  gitCommit: string | null;
  buildVersion: string | null;
}

export function resolveEnforcementCoverageVersion(): EnforcementCoverageVersionInfo {
  const buildVersion =
    process.env.BUILD_VERSION?.trim() ||
    process.env.npm_package_version?.trim() ||
    null;

  const gitCommit =
    process.env.GIT_COMMIT_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    tryResolveGitCommit() ||
    null;

  return {
    coverageVersion: `${ENFORCEMENT_COVERAGE_CATALOG_VERSION}@${gitCommit ?? buildVersion ?? 'local'}`,
    gitCommit,
    buildVersion,
  };
}

function tryResolveGitCommit(): string | null {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: WORKSPACE_ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

export function readBaselineFlowIds(): string[] {
  const baselinePath = join(
    WORKSPACE_ROOT,
    'docs/audits/data/data-authorization-enforcement-coverage-baseline-2026-07.csv',
  );
  if (!existsSync(baselinePath)) {
    return [];
  }
  const raw = readFileSync(baselinePath, 'utf8');
  return raw
    .split('\n')
    .slice(1)
    .map((line) => line.split(',')[0]?.trim())
    .filter((id): id is string => Boolean(id) && id !== 'flowId');
}

export function testSpecExists(relativePath: string): boolean {
  return existsSync(join(WORKSPACE_ROOT, relativePath));
}
