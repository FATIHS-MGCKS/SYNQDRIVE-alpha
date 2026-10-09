import { evaluatePhaseAPreflightProductionAdmissionV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-admission.v1';
import type { M3_3HvH4A3PhaseAExternalHumanAuthorizationAuthenticationV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-go-no-go.types.v1';
import { evaluatePhaseAProductionOperationalReadinessV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-operational-readiness.v1';
import { validatePhaseAProductionMigrationOwnerCredentialIsolationV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-migration-owner-boundary.v1';

/**
 * P1 execution authorization is always NO_GO until an independently trusted authorization system exists.
 * Passing this gate means offline contracts + R4.2A admission pre-checks align — not external human auth.
 */
export type M3_3HvH4A3PhaseAProductionP1AuthorizationV1 = 'NO_GO';

export type M3_3HvH4A3PhaseAProductionP1ExecutionGateResultV1 =
  | {
      ok: true;
      p1Authorization: M3_3HvH4A3PhaseAProductionP1AuthorizationV1;
      externalHumanAuthorizationAuthentication: M3_3HvH4A3PhaseAExternalHumanAuthorizationAuthenticationV1;
      operationalReadinessDecision: 'READY';
    }
  | {
      ok: false;
      reasonCode: string;
      p1Authorization: M3_3HvH4A3PhaseAProductionP1AuthorizationV1;
    };

/**
 * Fail-closed gate for production Phase-A execution — no PostgreSQL connect.
 * Combines R4.2B-P0 operational readiness, migration-owner isolation, and R4.2A admission pre-checks.
 */
export function evaluatePhaseAProductionP1ExecutionGateV1(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  options: { now?: Date } = {},
): M3_3HvH4A3PhaseAProductionP1ExecutionGateResultV1 {
  const readiness = evaluatePhaseAProductionOperationalReadinessV1(env, options);
  if (readiness.decision !== 'READY') {
    const reasonCode =
      readiness.blockers[0] ?? 'PHASE_A_P1_EXECUTION_OPERATIONAL_READINESS_NO_GO';
    return { ok: false, reasonCode, p1Authorization: 'NO_GO' };
  }

  const migration = validatePhaseAProductionMigrationOwnerCredentialIsolationV1(databaseUrl, env);
  if (!migration.ok) {
    return { ok: false, reasonCode: migration.reasonCode, p1Authorization: 'NO_GO' };
  }

  const admission = evaluatePhaseAPreflightProductionAdmissionV1(databaseUrl, env, {
    consumeApproval: false,
    now: options.now,
  });
  if (!admission.ok) {
    return { ok: false, reasonCode: admission.reasonCode, p1Authorization: 'NO_GO' };
  }

  return {
    ok: true,
    p1Authorization: 'NO_GO',
    externalHumanAuthorizationAuthentication: 'UNVERIFIED',
    operationalReadinessDecision: 'READY',
  };
}
