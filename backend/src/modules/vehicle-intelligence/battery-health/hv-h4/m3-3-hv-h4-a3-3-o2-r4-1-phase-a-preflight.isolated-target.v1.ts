import { canonicalPostgresTargetKeyV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';

export const M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED' as const;

export const M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_DATABASE_URL_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_DATABASE_URL' as const;

/** Test-only — never set in deployable runtime. Allows integration URL to match app URL in CI fixtures only. */
export const M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE' as const;

export const M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_QUERY_TELEMETRY_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_QUERY_TELEMETRY' as const;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export type M3_3HvH4A3PhaseAIsolatedTargetValidationResultV1 =
  | { ok: true; canonicalTargetKey: string }
  | { ok: false; reasonCode: string };

function parseDatabaseUrlV1(databaseUrl: string): URL | null {
  try {
    return new URL(databaseUrl.trim().replace(/^postgresql:/, 'postgres:'));
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(lower)) return true;
  if (lower.startsWith('127.')) {
    const parts = lower.split('.');
    if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
      return parts.every((p) => Number(p) >= 0 && Number(p) <= 255);
    }
  }
  return false;
}

export function validateIsolatedPhaseADatabaseTargetV1(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  options: { requireExplicitApproval?: boolean } = {},
): M3_3HvH4A3PhaseAIsolatedTargetValidationResultV1 {
  if (options.requireExplicitApproval !== false) {
    const approved = env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED_ENV]?.trim();
    const truthy = approved === '1' || approved?.toLowerCase() === 'true' || approved?.toLowerCase() === 'yes';
    if (!truthy) {
      return { ok: false, reasonCode: 'PHASE_A_ISOLATED_TARGET_NOT_APPROVED' };
    }
  }

  const parsed = parseDatabaseUrlV1(databaseUrl);
  if (!parsed?.hostname) {
    return { ok: false, reasonCode: 'PHASE_A_DATABASE_URL_INVALID' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!isLoopbackHost(hostname)) {
    return { ok: false, reasonCode: 'PHASE_A_ISOLATED_TARGET_LOOPBACK_REQUIRED' };
  }

  const canonicalTargetKey = canonicalPostgresTargetKeyV1(databaseUrl);
  if (!canonicalTargetKey) {
    return { ok: false, reasonCode: 'PHASE_A_DATABASE_URL_INVALID' };
  }

  return { ok: true, canonicalTargetKey };
}
