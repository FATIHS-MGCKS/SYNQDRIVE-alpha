import { execSync } from 'child_process';
import * as path from 'path';

const SHA40 = /^[0-9a-f]{40}$/;

export class Ds4Layer2HistoricalExportEvaluationAttestationErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Ds4Layer2HistoricalExportEvaluationAttestationErrorV1';
  }
}

function repoRootFromModule(): string {
  return path.resolve(__dirname, '../../../../../../..');
}

export function resolveEvaluationCodeShaFromGitCheckoutV1(cwd: string = repoRootFromModule()): string {
  let sha: string;
  try {
    sha = execSync('git rev-parse HEAD', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    throw new Ds4Layer2HistoricalExportEvaluationAttestationErrorV1(
      'Cannot resolve evaluation code SHA — git rev-parse HEAD failed (not a git checkout?)',
    );
  }
  if (!SHA40.test(sha)) {
    throw new Ds4Layer2HistoricalExportEvaluationAttestationErrorV1(
      `Invalid evaluation code SHA from git: ${sha}`,
    );
  }
  return sha;
}

export function assertDeployShaMatchesEvaluationCheckoutV1(input: {
  deployShaAssertion: string | undefined;
  evaluationCodeSha: string;
}): void {
  if (input.deployShaAssertion == null) return;
  const normalized = input.deployShaAssertion.trim().toLowerCase();
  if (!SHA40.test(normalized)) {
    throw new Ds4Layer2HistoricalExportEvaluationAttestationErrorV1(
      '--deploy-sha must be a 40-character lowercase hex git commit SHA when provided',
    );
  }
  if (normalized !== input.evaluationCodeSha) {
    throw new Ds4Layer2HistoricalExportEvaluationAttestationErrorV1(
      `--deploy-sha ${normalized} does not match checkout HEAD ${input.evaluationCodeSha}`,
    );
  }
}
