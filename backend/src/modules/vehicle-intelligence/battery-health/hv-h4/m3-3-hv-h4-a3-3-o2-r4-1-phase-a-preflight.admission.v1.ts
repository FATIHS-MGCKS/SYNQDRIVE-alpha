import { canonicalPostgresTargetKeyV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';
import { M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV } from './m3-3-hv-h4-a3-3-o2-r3-issuer-runtime-factory.inert.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_DATABASE_URL_ENV,
  M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV,
  validateIsolatedPhaseADatabaseTargetV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.isolated-target.v1';

export type M3_3HvH4A3PhaseAPreflightAdmissionResultV1 =
  | { ok: true }
  | { ok: false; reasonCode: string };

function urlsRepresentSameTargetV1(a: string, b: string): boolean {
  if (a === b) return true;
  const keyA = canonicalPostgresTargetKeyV1(a);
  const keyB = canonicalPostgresTargetKeyV1(b);
  return Boolean(keyA && keyB && keyA === keyB);
}

function isIntegrationHarnessCredentialBypassAllowedV1(
  phaseDatabaseUrl: string,
  env: NodeJS.ProcessEnv,
): boolean {
  const harnessActive = env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV]?.trim();
  const harnessOn =
    harnessActive === '1' || harnessActive?.toLowerCase() === 'true' || harnessActive?.toLowerCase() === 'yes';
  if (!harnessOn) return false;

  const integrationUrl = env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_DATABASE_URL_ENV]?.trim();
  if (!integrationUrl) return false;

  return phaseDatabaseUrl === integrationUrl || urlsRepresentSameTargetV1(phaseDatabaseUrl, integrationUrl);
}

/**
 * Shared admission gate for CLI and runner — credential isolation + isolated loopback target.
 * Integration harness bypass applies only when harness env is active and URL matches integration URL env.
 */
export function evaluatePhaseAPreflightDatabaseAdmissionV1(
  phaseDatabaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): M3_3HvH4A3PhaseAPreflightAdmissionResultV1 {
  const isolated = validateIsolatedPhaseADatabaseTargetV1(phaseDatabaseUrl, env, {
    requireExplicitApproval: true,
  });
  if (!isolated.ok) {
    return { ok: false, reasonCode: isolated.reasonCode };
  }

  const harnessBypass = isIntegrationHarnessCredentialBypassAllowedV1(phaseDatabaseUrl, env);
  if (!harnessBypass) {
    const genericUrl = env.DATABASE_URL?.trim();
    if (genericUrl && urlsRepresentSameTargetV1(phaseDatabaseUrl, genericUrl)) {
      return { ok: false, reasonCode: 'PHASE_A_CANNOT_REUSE_DATABASE_URL' };
    }

    const issuerUrl = env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV]?.trim();
    if (issuerUrl && urlsRepresentSameTargetV1(phaseDatabaseUrl, issuerUrl)) {
      return { ok: false, reasonCode: 'PHASE_A_CANNOT_REUSE_ISSUER_DATABASE_URL' };
    }
  }

  return { ok: true };
}
