import { parsePostgresUrlLoginV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';
import { DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.config.v1';
import type { M3_3HvH4A3PhaseAPreflightRoleNamesV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.types.v1';
import { evaluatePhaseAPreflightProductionAdmissionV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-admission.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_DATABASE_URL_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_ENABLED_ENV,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.v1';

export type M3_3HvH4A3PhaseAProductionPreflightResolvedConfigV1 = {
  databaseUrl: string;
  roleNames: M3_3HvH4A3PhaseAPreflightRoleNamesV1;
};

export type M3_3HvH4A3PhaseAProductionPreflightConfigParseResultV1 =
  | { ok: true; config: M3_3HvH4A3PhaseAProductionPreflightResolvedConfigV1 }
  | { ok: false; reasonCode: string };

/**
 * Parses production Phase-A config. Admission (approval + execute + consumption) is evaluated here and again at runner entry.
 */
export function parseM3_3HvH4A3PhaseAProductionPreflightConfigFromEnvV1(
  env: NodeJS.ProcessEnv = process.env,
  options: { consumeApproval?: boolean } = {},
): M3_3HvH4A3PhaseAProductionPreflightConfigParseResultV1 {
  const databaseUrl = env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_DATABASE_URL_ENV]?.trim();
  if (!databaseUrl) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_DATABASE_URL_REQUIRED' };
  }

  if (!parsePostgresUrlLoginV1(databaseUrl)) {
    return { ok: false, reasonCode: 'PHASE_A_DATABASE_URL_LOGIN_REQUIRED' };
  }

  const admission = evaluatePhaseAPreflightProductionAdmissionV1(databaseUrl, env, {
    consumeApproval: options.consumeApproval ?? false,
  });
  if (!admission.ok) {
    return { ok: false, reasonCode: admission.reasonCode };
  }

  return {
    ok: true,
    config: {
      databaseUrl,
      roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
    },
  };
}
