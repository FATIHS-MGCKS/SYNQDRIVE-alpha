import { canonicalPostgresTargetKeyV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';

export const M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED' as const;

export const M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_DATABASE_URL_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_DATABASE_URL' as const;

const FORBIDDEN_HOST_SUBSTRINGS = [
  'synqdrive',
  'hstgr',
  'hostinger',
  'tailscale',
  'ts.net',
  'amazonaws',
  'azure',
  'googleapis',
  'cloud',
  'prod.',
  'production',
] as const;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

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
  if (lower === '[::1]') return true;
  return false;
}

function readOptionalHostAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  const raw = env.M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_HOST_ALLOWLIST?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isForbiddenRemoteHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (FORBIDDEN_HOST_SUBSTRINGS.some((token) => lower.includes(token))) {
    return true;
  }
  if (lower.includes('.')) {
    const parts = lower.split('.');
    if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
      const octets = parts.map((p) => Number(p));
      if (octets[0] === 10) return true;
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
      if (octets[0] === 192 && octets[1] === 168) return true;
      if (octets[0] !== 127) return true;
    }
  }
  return false;
}

export function validateIsolatedPhaseADatabaseTargetV1(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  options: { requireExplicitApproval?: boolean } = {},
): M3_3HvH4A3PhaseAIsolatedTargetValidationResultV1 {
  if (options.requireExplicitApproval) {
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
  const allowlist = readOptionalHostAllowlist(env);
  const allowedByList = allowlist.has(hostname);

  if (!isLoopbackHost(hostname) && !allowedByList) {
    return { ok: false, reasonCode: 'PHASE_A_ISOLATED_TARGET_HOST_NOT_ALLOWED' };
  }

  if (!allowedByList && isForbiddenRemoteHost(hostname)) {
    return { ok: false, reasonCode: 'PHASE_A_ISOLATED_TARGET_HOST_FORBIDDEN' };
  }

  const canonicalTargetKey = canonicalPostgresTargetKeyV1(databaseUrl);
  if (!canonicalTargetKey) {
    return { ok: false, reasonCode: 'PHASE_A_DATABASE_URL_INVALID' };
  }

  return { ok: true, canonicalTargetKey };
}
