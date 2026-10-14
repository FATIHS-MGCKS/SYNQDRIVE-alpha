#!/usr/bin/env ts-node
import { issueVoSigB1OwnerRollbackAuthorization } from '../../src/modules/vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconcile-owner-authorization';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`MISSING_ENV:${name}`);
  return value;
}

async function main(): Promise<void> {
  const approvedReleaseSha = requireEnv('SYNQDRIVE_RELEASE_GIT_SHA');
  const targetAuditId = requireEnv('VO_SIG_B1_ROLLBACK_TARGET_AUDIT_ID');
  const authorizationReference = requireEnv('VO_SIG_B1_AUTHORIZATION_REFERENCE');
  const runId = requireEnv('VO_SIG_B1_RUN_ID');
  const ttlMinutes = Number.parseInt(process.env.VO_SIG_B1_AUTHORIZATION_TTL_MINUTES ?? '30', 10);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();

  const token = issueVoSigB1OwnerRollbackAuthorization({
    approvedReleaseSha,
    targetAuditId,
    authorizationReference,
    runId,
    expiresAt,
  });
  process.stdout.write(`${token}\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
