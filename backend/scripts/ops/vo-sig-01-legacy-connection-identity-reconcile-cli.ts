#!/usr/bin/env ts-node
/**
 * VO-SIG-01 B1 operator CLI — default DRY_RUN; EXECUTE requires owner authorization token.
 */
import { PrismaClient } from '@prisma/client';
import {
  resolveLegacyReconcileCliInput,
  runLegacyReconcileDryRun,
  runLegacyReconcileExecute,
} from '../../src/modules/vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconcile-cli.lib';
import { LegacyReconcileFailFastError } from '../../src/modules/vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconcile-fail-fast';
import type { LegacyReconcileAuthorization } from '../../src/modules/vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-connection-identity-reconcile.types';
import { computeLegacyReconcileOperatorAdmissionProof } from '../../src/modules/vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconcile-operator-admission';

function redactOutput(value: unknown): unknown {
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) return value.map(redactOutput);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.toLowerCase().includes('secret') || k.toLowerCase().includes('token') || k === 'operatorAdmissionProof') {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactOutput(v);
      }
    }
    return out;
  }
  return value;
}

function buildExecuteAuthFromEnv(
  input: { organizationId: string; linkIds: string[]; manifestFingerprint: string },
): LegacyReconcileAuthorization {
  const secret = process.env.VO_SIG_B1_OPERATOR_ADMISSION_SECRET?.trim();
  if (!secret) {
    throw new Error('LEGACY_RECONCILE_OPERATOR_ADMISSION_SECRET_MISSING');
  }
  const runId = process.env.VO_SIG_B1_RUN_ID?.trim();
  const authorizationReference = process.env.VO_SIG_B1_AUTHORIZATION_REFERENCE?.trim();
  const operatorReference = process.env.VO_SIG_B1_OPERATOR_REFERENCE?.trim();
  const productionReleaseSha = process.env.SYNQDRIVE_RELEASE_GIT_SHA?.trim();
  const ownerToken = process.env.VO_SIG_B1_OWNER_EXECUTE_AUTHORIZATION?.trim();
  if (!runId || !authorizationReference || !operatorReference || !productionReleaseSha || !ownerToken) {
    throw new Error('LEGACY_RECONCILE_EXECUTE_ENV_INCOMPLETE');
  }
  const manifestFingerprint = input.manifestFingerprint;
  const operatorAdmissionProof = computeLegacyReconcileOperatorAdmissionProof({
    manifestFingerprint,
    runId,
    authorizationReference,
    secret,
  });
  return {
    mode: 'EXECUTE',
    allowlistedLinkIds: new Set(input.linkIds),
    manifestFingerprint,
    tenantScopeOrganizationId: input.organizationId,
    authorizationReference,
    operatorReference,
    operatorAdmissionProof,
    ownerExecuteAuthorizationToken: ownerToken,
    runId,
    productionReleaseSha,
  };
}

async function main(): Promise<void> {
  const mode = (process.env.VO_SIG_B1_CLI_MODE ?? 'DRY_RUN').trim().toUpperCase();
  const prisma = new PrismaClient();
  const input = resolveLegacyReconcileCliInput();
  try {
    if (mode === 'DRY_RUN') {
      const payload = await runLegacyReconcileDryRun(prisma, input);
      console.log(JSON.stringify(redactOutput(payload), null, 2));
      return;
    }
    if (mode !== 'EXECUTE') {
      throw new Error('LEGACY_RECONCILE_CLI_MODE_INVALID');
    }
    const dry = await runLegacyReconcileDryRun(prisma, input);
    const auth = buildExecuteAuthFromEnv({
      organizationId: input.organizationId,
      linkIds: input.linkIds,
      manifestFingerprint: dry.manifestFingerprint,
    });
    const executed = await runLegacyReconcileExecute(prisma, input, auth);
    const skipped = executed.results.filter((r) => r.outcome === 'SKIPPED');
    if (skipped.length > 0) {
      console.error(JSON.stringify(redactOutput({ error: 'UNEXPECTED_SKIPPED', results: executed.results }), null, 2));
      process.exit(2);
    }
    console.log(JSON.stringify(redactOutput(executed), null, 2));
  } catch (err) {
    if (err instanceof LegacyReconcileFailFastError) {
      console.error(
        JSON.stringify(
          redactOutput({
            error: err.message,
            failedLinkId: err.failedLinkId,
            reasonCodes: err.reasonCodes,
            results: err.results,
          }),
          null,
          2,
        ),
      );
      process.exit(2);
    }
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
