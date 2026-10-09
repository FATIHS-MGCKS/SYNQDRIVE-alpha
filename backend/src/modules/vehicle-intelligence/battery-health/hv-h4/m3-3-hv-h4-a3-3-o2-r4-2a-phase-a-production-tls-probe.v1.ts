import { PrismaClient } from '@prisma/client';

export type PhaseAProductionTlsNegotiationEvidenceV1 = {
  sslActive: true;
  version: string | null;
  cipher: string | null;
};

/**
 * Runtime TLS evidence from PostgreSQL — URL sslmode alone is insufficient.
 * verify-full hostname/CA checks occur at driver connect; this confirms an encrypted session.
 */
export async function verifyPhaseAProductionTlsNegotiationV1(
  client: PrismaClient,
): Promise<
  | { ok: true; evidence: PhaseAProductionTlsNegotiationEvidenceV1 }
  | { ok: false; reasonCode: string }
> {
  try {
    const rows = await client.$queryRawUnsafe<
      Array<{ ssl: boolean; version: string | null; cipher: string | null }>
    >(
      `SELECT ssl, version, cipher FROM pg_stat_ssl WHERE pid = pg_backend_pid()`,
    );
    const row = rows[0];
    if (!row?.ssl) {
      return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_TLS_HANDSHAKE_NOT_ENCRYPTED' };
    }
    return {
      ok: true,
      evidence: {
        sslActive: true,
        version: row.version,
        cipher: row.cipher,
      },
    };
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_TLS_STAT_UNAVAILABLE' };
  }
}
