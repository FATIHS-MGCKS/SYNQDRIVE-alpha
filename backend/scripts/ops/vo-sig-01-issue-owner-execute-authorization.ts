#!/usr/bin/env ts-node
/**
 * Offline owner execute authorization issuer (stdout token only — never log secret).
 */
import { issueVoSigB1OwnerExecuteAuthorization } from '../../src/modules/vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconcile-owner-authorization';
import {
  VO_SIG_B1_PRODUCTION_COHORT_ORGANIZATION_ID,
  VO_SIG_B1_PRODUCTION_COHORT_SOURCE_LINK_IDS,
} from '../../src/modules/vehicle-onboarding/connection-identity/legacy-reconciliation/vo-sig-b1-production-cohort.registry';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`MISSING_ENV:${name}`);
  return value;
}

async function main(): Promise<void> {
  const approvedReleaseSha = requireEnv('SYNQDRIVE_RELEASE_GIT_SHA');
  const manifestFingerprint = requireEnv('VO_SIG_B1_MANIFEST_FINGERPRINT');
  const authorizationReference = requireEnv('VO_SIG_B1_AUTHORIZATION_REFERENCE');
  const runId = requireEnv('VO_SIG_B1_RUN_ID');
  const ttlMinutes = Number.parseInt(process.env.VO_SIG_B1_AUTHORIZATION_TTL_MINUTES ?? '30', 10);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  const organizationId = process.env.VO_SIG_B1_ORGANIZATION_ID?.trim() || VO_SIG_B1_PRODUCTION_COHORT_ORGANIZATION_ID;
  const linkIds = process.env.VO_SIG_B1_LINK_IDS?.trim()
    ? process.env.VO_SIG_B1_LINK_IDS.split(',').map((s) => s.trim())
    : [...VO_SIG_B1_PRODUCTION_COHORT_SOURCE_LINK_IDS];

  const token = issueVoSigB1OwnerExecuteAuthorization({
    approvedReleaseSha,
    organizationId,
    sourceLinkIds: linkIds,
    manifestFingerprint,
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
