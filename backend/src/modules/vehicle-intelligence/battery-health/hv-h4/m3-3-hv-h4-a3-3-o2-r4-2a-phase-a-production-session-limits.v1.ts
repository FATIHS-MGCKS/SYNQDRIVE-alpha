import type { PhaseAProductionSqlQueryableV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-tls-identity.v1';

/** Server-side statement cap — must stay below Prisma interactive transaction timeout (120s). */
export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_STATEMENT_TIMEOUT = '60s' as const;

/** Bounded lock wait inside the same READ ONLY transaction. */
export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_LOCK_TIMEOUT = '5s' as const;

const ALLOWED_SESSION_SETTING_KEYS = new Set(['statement_timeout', 'lock_timeout']);

/**
 * Applies session-local PostgreSQL timeouts inside the current transaction.
 * Uses SET LOCAL only — does not mutate role or database defaults.
 */
export async function applyPhaseAProductionReadOnlySessionLimitsV1(
  tx: PhaseAProductionSqlQueryableV1,
): Promise<{ ok: true } | { ok: false; reasonCode: string }> {
  const settings: Array<{ key: string; value: string }> = [
    { key: 'statement_timeout', value: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_STATEMENT_TIMEOUT },
    { key: 'lock_timeout', value: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_LOCK_TIMEOUT },
  ];

  for (const { key, value } of settings) {
    if (!ALLOWED_SESSION_SETTING_KEYS.has(key)) {
      return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_SESSION_SETTING_NOT_ALLOWED' };
    }
    try {
      await tx.$executeRawUnsafe(`SET LOCAL ${key} = '${value}'`);
    } catch {
      return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_SESSION_LIMITS_APPLY_FAILED' };
    }
  }

  return { ok: true };
}
