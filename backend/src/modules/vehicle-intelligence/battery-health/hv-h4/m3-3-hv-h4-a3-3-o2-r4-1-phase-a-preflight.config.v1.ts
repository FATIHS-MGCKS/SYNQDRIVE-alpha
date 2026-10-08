import {
  canonicalPostgresTargetKeyV1,
  parsePostgresUrlLoginV1,
} from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';
import type { M3_3HvH4A3PhaseAPreflightRoleNamesV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.types.v1';
import { M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV } from './m3-3-hv-h4-a3-3-o2-r3-issuer-runtime-factory.inert.v1';

export const M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ENABLED_ENV = 'M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ENABLED' as const;
export const M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_DATABASE_URL_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_DATABASE_URL' as const;

const PRODUCTION_HOST_BLOCKLIST = [
  'app.synqdrive.eu',
  'synqdrive.eu',
  'hstgr.cloud',
  'hostinger',
  'production',
  'prod.',
] as const;

export const DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1: M3_3HvH4A3PhaseAPreflightRoleNamesV1 = {
  migrationOwner: 'MIGRATION_OWNER',
  generalAppRuntime: 'GENERAL_APP_RUNTIME',
  trustedAttestationIssuer: 'TRUSTED_ATTESTATION_ISSUER',
};

export type M3_3HvH4A3PhaseAPreflightResolvedConfigV1 = {
  databaseUrl: string;
  roleNames: M3_3HvH4A3PhaseAPreflightRoleNamesV1;
};

export type M3_3HvH4A3PhaseAPreflightConfigParseResultV1 =
  | { ok: true; config: M3_3HvH4A3PhaseAPreflightResolvedConfigV1 }
  | { ok: false; reasonCode: string };

function isTruthyEnabled(raw: string | undefined): boolean {
  if (!raw?.trim()) return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return PRODUCTION_HOST_BLOCKLIST.some((token) => lower.includes(token));
}

export function parseM3_3HvH4A3PhaseAPreflightConfigFromEnvV1(
  env: NodeJS.ProcessEnv = process.env,
): M3_3HvH4A3PhaseAPreflightConfigParseResultV1 {
  if (!isTruthyEnabled(env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ENABLED_ENV])) {
    return { ok: false, reasonCode: 'PHASE_A_PREFLIGHT_DISABLED' };
  }

  const databaseUrl = env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_DATABASE_URL_ENV]?.trim();
  if (!databaseUrl) {
    return { ok: false, reasonCode: 'PHASE_A_DATABASE_URL_REQUIRED' };
  }

  const genericUrl = env.DATABASE_URL?.trim();
  if (genericUrl) {
    const sameTarget =
      canonicalPostgresTargetKeyV1(databaseUrl) === canonicalPostgresTargetKeyV1(genericUrl);
    if (sameTarget || databaseUrl === genericUrl) {
      return { ok: false, reasonCode: 'PHASE_A_CANNOT_REUSE_DATABASE_URL' };
    }
  }

  const issuerUrl = env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV]?.trim();
  if (issuerUrl) {
    const sameIssuer =
      canonicalPostgresTargetKeyV1(databaseUrl) === canonicalPostgresTargetKeyV1(issuerUrl);
    if (sameIssuer || databaseUrl === issuerUrl) {
      return { ok: false, reasonCode: 'PHASE_A_CANNOT_REUSE_ISSUER_DATABASE_URL' };
    }
  }

  try {
    const parsed = new URL(databaseUrl.replace(/^postgresql:/, 'postgres:'));
    if (isBlockedHostname(parsed.hostname)) {
      return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_HOST_BLOCKED' };
    }
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_DATABASE_URL_INVALID' };
  }

  if (!parsePostgresUrlLoginV1(databaseUrl)) {
    return { ok: false, reasonCode: 'PHASE_A_DATABASE_URL_LOGIN_REQUIRED' };
  }

  return {
    ok: true,
    config: {
      databaseUrl,
      roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
    },
  };
}
