import { execSync } from 'child_process';
import { join } from 'path';
import { COMPLIANCE_EVIDENCE } from './compliance-evidence.constants';

const WORKSPACE_ROOT = join(__dirname, '..', '..', '..', '..', '..');

export interface ComplianceEvidenceVersionInfo {
  recordVersion: string;
  gitCommit: string | null;
  buildVersion: string | null;
  provenanceLabel: string;
}

export function resolveComplianceEvidenceVersion(): ComplianceEvidenceVersionInfo {
  const buildVersion =
    process.env.BUILD_VERSION?.trim() ||
    process.env.npm_package_version?.trim() ||
    null;

  const gitCommit =
    process.env.GIT_COMMIT_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    tryResolveGitCommit() ||
    null;

  const provenanceLabel = `${COMPLIANCE_EVIDENCE.recordVersion}@${gitCommit ?? buildVersion ?? 'local'}`;

  return {
    recordVersion: COMPLIANCE_EVIDENCE.recordVersion,
    gitCommit,
    buildVersion,
    provenanceLabel,
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
