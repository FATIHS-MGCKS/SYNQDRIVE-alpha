import { Prisma } from '@prisma/client';
import { validatePhaseAProductionTlsUrlPolicyV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-target.v1';

export type PhaseAProductionTlsSessionEvidenceV1 = {
  backendPid: number;
  sslActive: boolean;
  version: string | null;
  cipher: string | null;
};

export type PhaseAProductionTlsIdentityCertificationV1 = {
  /** Driver established connection under verify-full + sslrootcert URL policy (connect-time identity). */
  verifyFullConnectPolicy: true;
  /** Encrypted session on this backend PID — necessary but not sufficient alone for identity. */
  sslSessionActive: boolean;
  /** Same PostgreSQL backend for anchor and TLS probe. */
  sameBackendPid: boolean;
  tlsIdentityCertified: boolean;
  evidence: PhaseAProductionTlsSessionEvidenceV1;
};

export type PhaseAProductionSqlQueryableV1 = {
  $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
};

export async function readPhaseAProductionBackendPidV1(
  client: PhaseAProductionSqlQueryableV1,
): Promise<number> {
  const rows = await client.$queryRawUnsafe<Array<{ pid: number }>>(
    `SELECT pg_backend_pid() AS pid`,
  );
  const pid = rows[0]?.pid;
  if (typeof pid !== 'number' || !Number.isFinite(pid)) {
    throw new Error('PHASE_A_PRODUCTION_BACKEND_PID_UNAVAILABLE');
  }
  return pid;
}

/**
 * Session TLS evidence from pg_stat_ssl for the current backend PID.
 * ssl=true proves encryption only — not CA or hostname verification.
 */
export async function capturePhaseAProductionTlsSessionEvidenceV1(
  client: PhaseAProductionSqlQueryableV1,
  anchorBackendPid: number,
): Promise<PhaseAProductionTlsSessionEvidenceV1> {
  const backendPid = await readPhaseAProductionBackendPidV1(client);
  const rows = await client.$queryRawUnsafe<
    Array<{ ssl: boolean; version: string | null; cipher: string | null }>
  >(
    `SELECT ssl, version, cipher FROM pg_stat_ssl WHERE pid = pg_backend_pid()`,
  );
  const row = rows[0];
  return {
    backendPid,
    sslActive: Boolean(row?.ssl),
    version: row?.version ?? null,
    cipher: row?.cipher ?? null,
  };
}

/**
 * Certify TLS server identity only when:
 * 1) URL policy requires verify-full + sslrootcert (re-checked, not inferred from URL alone at call site),
 * 2) Prisma connect already succeeded under that URL (driver verified CA + hostname at handshake),
 * 3) pg_stat_ssl reports encrypted session on the same backend PID as the session anchor.
 */
export function certifyPhaseAProductionTlsIdentityV1(
  databaseUrl: string,
  sessionEvidence: PhaseAProductionTlsSessionEvidenceV1,
  anchorBackendPid: number,
):
  | { ok: true; certification: PhaseAProductionTlsIdentityCertificationV1 }
  | { ok: false; reasonCode: string } {
  const urlPolicy = validatePhaseAProductionTlsUrlPolicyV1(databaseUrl);
  if (!urlPolicy.ok) {
    return urlPolicy;
  }

  if (!sessionEvidence.sslActive) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_TLS_HANDSHAKE_NOT_ENCRYPTED' };
  }

  const sameBackendPid = sessionEvidence.backendPid === anchorBackendPid;
  if (!sameBackendPid) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_SESSION_PID_MISMATCH' };
  }

  return {
    ok: true,
    certification: {
      verifyFullConnectPolicy: true,
      sslSessionActive: true,
      sameBackendPid: true,
      tlsIdentityCertified: true,
      evidence: sessionEvidence,
    },
  };
}

export async function evaluatePhaseAProductionTlsIdentityInSessionV1(
  client: PhaseAProductionSqlQueryableV1,
  databaseUrl: string,
  anchorBackendPid: number,
): Promise<
  | { ok: true; certification: PhaseAProductionTlsIdentityCertificationV1 }
  | { ok: false; reasonCode: string }
> {
  try {
    const sessionEvidence = await capturePhaseAProductionTlsSessionEvidenceV1(
      client,
      anchorBackendPid,
    );
    const certified = certifyPhaseAProductionTlsIdentityV1(
      databaseUrl,
      sessionEvidence,
      anchorBackendPid,
    );
    if (!certified.ok) {
      return certified;
    }
    return { ok: true, certification: certified.certification };
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_TLS_STAT_UNAVAILABLE' };
  }
}

/** @deprecated Use evaluatePhaseAProductionTlsIdentityInSessionV1 — ssl=true alone is not identity certification. */
export async function verifyPhaseAProductionTlsNegotiationV1(
  client: PhaseAProductionSqlQueryableV1,
  databaseUrl: string,
  anchorBackendPid: number,
): Promise<
  | { ok: true; tlsIdentityCertified: boolean }
  | { ok: false; reasonCode: string }
> {
  const result = await evaluatePhaseAProductionTlsIdentityInSessionV1(
    client,
    databaseUrl,
    anchorBackendPid,
  );
  if (!result.ok) return result;
  return { ok: true, tlsIdentityCertified: result.certification.tlsIdentityCertified };
}
