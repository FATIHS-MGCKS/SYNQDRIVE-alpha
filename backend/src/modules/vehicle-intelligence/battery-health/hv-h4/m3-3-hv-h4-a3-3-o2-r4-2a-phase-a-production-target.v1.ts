import {
  canonicalPostgresTargetKeyV1,
  parsePostgresUrlLoginV1,
} from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_CONTRACT_V1,
  type M3_3HvH4A3PhaseAProductionTargetSpecV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.types.v1';
import { M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON_ENV } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.v1';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

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
  if (lower.startsWith('127.')) return true;
  return false;
}

export function parsePhaseAProductionTargetSpecFromEnvV1(
  env: NodeJS.ProcessEnv,
): { ok: true; spec: M3_3HvH4A3PhaseAProductionTargetSpecV1 } | { ok: false; reasonCode: string } {
  const raw = env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON_ENV]?.trim();
  if (!raw) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_TARGET_SPEC_REQUIRED' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_TARGET_SPEC_INVALID_JSON' };
  }
  const spec = parsed as M3_3HvH4A3PhaseAProductionTargetSpecV1;
  if (spec.contractVersion !== M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_CONTRACT_V1) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_TARGET_SPEC_CONTRACT_MISMATCH' };
  }
  if (!spec.hostname?.trim() || !spec.database?.trim() || !spec.expectedAuditLogin?.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_TARGET_SPEC_INCOMPLETE' };
  }
  if (!Number.isFinite(spec.port) || spec.port <= 0 || spec.port > 65535) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_TARGET_SPEC_INCOMPLETE' };
  }
  return { ok: true, spec };
}

export function validatePhaseAProductionDatabaseUrlAgainstTargetSpecV1(
  databaseUrl: string,
  spec: M3_3HvH4A3PhaseAProductionTargetSpecV1,
): { ok: true; canonicalTargetKey: string } | { ok: false; reasonCode: string } {
  const parsed = parseDatabaseUrlV1(databaseUrl);
  if (!parsed?.hostname) {
    return { ok: false, reasonCode: 'PHASE_A_DATABASE_URL_INVALID' };
  }

  const login = parsePostgresUrlLoginV1(databaseUrl);
  if (!login) {
    return { ok: false, reasonCode: 'PHASE_A_DATABASE_URL_LOGIN_REQUIRED' };
  }

  const host = parsed.hostname.toLowerCase();
  const specHost = spec.hostname.toLowerCase();
  const port = Number(parsed.port || '5432');
  const database = parsed.pathname.replace(/^\//, '').split('/')[0] ?? '';

  if (host !== specHost) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_TARGET_HOST_MISMATCH' };
  }
  if (port !== spec.port) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_TARGET_PORT_MISMATCH' };
  }
  if (database !== spec.database) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_TARGET_DATABASE_MISMATCH' };
  }
  if (login !== spec.expectedAuditLogin) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_AUDIT_LOGIN_MISMATCH' };
  }

  const canonicalTargetKey = canonicalPostgresTargetKeyV1(databaseUrl);
  if (!canonicalTargetKey) {
    return { ok: false, reasonCode: 'PHASE_A_DATABASE_URL_INVALID' };
  }

  const tls = validatePhaseAProductionTlsPolicyV1(databaseUrl, spec);
  if (!tls.ok) return tls;

  const tunnel = detectPhaseAProductionTunnelAmbiguityV1(databaseUrl, spec);
  if (!tunnel.ok) return tunnel;

  return { ok: true, canonicalTargetKey };
}

export function validatePhaseAProductionTlsPolicyV1(
  databaseUrl: string,
  spec: M3_3HvH4A3PhaseAProductionTargetSpecV1,
): { ok: true } | { ok: false; reasonCode: string } {
  if (!spec.requireTlsIdentityVerification) {
    return { ok: true };
  }

  const parsed = parseDatabaseUrlV1(databaseUrl);
  if (!parsed) {
    return { ok: false, reasonCode: 'PHASE_A_DATABASE_URL_INVALID' };
  }

  const sslmode = (parsed.searchParams.get('sslmode') ?? '').toLowerCase();
  if (!sslmode) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_TLS_SSLMODE_REQUIRED' };
  }
  if (sslmode === 'disable' || sslmode === 'allow') {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_TLS_INSECURE_SSLMODE' };
  }
  if (sslmode !== 'verify-full' && sslmode !== 'verify-ca' && sslmode !== 'require') {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_TLS_SSLMODE_UNSUPPORTED' };
  }
  if (sslmode === 'require') {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_TLS_SERVER_IDENTITY_NOT_VERIFIED' };
  }

  return { ok: true };
}

/**
 * Loopback URL with non-loopback declared target (or inverse) indicates port-forward / proxy ambiguity.
 */
export function detectPhaseAProductionTunnelAmbiguityV1(
  databaseUrl: string,
  spec: M3_3HvH4A3PhaseAProductionTargetSpecV1,
): { ok: true } | { ok: false; reasonCode: string } {
  const parsed = parseDatabaseUrlV1(databaseUrl);
  if (!parsed?.hostname) {
    return { ok: false, reasonCode: 'PHASE_A_DATABASE_URL_INVALID' };
  }

  const urlLoopback = isLoopbackHost(parsed.hostname);
  const specLoopback = isLoopbackHost(spec.hostname);

  if (urlLoopback !== specLoopback) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_TUNNEL_IDENTITY_AMBIGUOUS' };
  }

  return { ok: true };
}

export function validatePhaseAProductionApprovedTargetKeyMatchV1(
  canonicalTargetKey: string,
  approvedTargetKey: string,
): { ok: true } | { ok: false; reasonCode: string } {
  if (canonicalTargetKey !== approvedTargetKey.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVED_TARGET_MISMATCH' };
  }
  return { ok: true };
}
