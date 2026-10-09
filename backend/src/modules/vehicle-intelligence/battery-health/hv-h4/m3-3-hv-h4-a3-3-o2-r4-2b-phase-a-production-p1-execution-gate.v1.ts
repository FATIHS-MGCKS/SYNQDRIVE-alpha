import { evaluatePhaseAPreflightProductionAdmissionV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-admission.v1';
import type { M3_3HvH4A3PhaseAExternalHumanAuthorizationAuthenticationV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-go-no-go.types.v1';
import { evaluatePhaseAProductionOperationalReadinessV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-operational-readiness.v1';
import { validatePhaseAProductionMigrationOwnerDeclarativeBoundaryV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-migration-owner-boundary.v1';

export const PHASE_A_P1_EXTERNAL_AUTHORIZATION_UNVERIFIED =
  'PHASE_A_P1_EXTERNAL_AUTHORIZATION_UNVERIFIED' as const;

/**
 * Production execution authorization — only `GO` permits PostgreSQL connect on the production path.
 * No in-repo mechanism promotes this to GO without independently trusted external evidence.
 */
export type M3_3HvH4A3PhaseAProductionP1AuthorizationV1 = 'NO_GO' | 'GO';

export type M3_3HvH4A3PhaseAProductionP1ExecutionGateResultV1 =
  | {
      ok: true;
      p1Authorization: 'GO';
      externalHumanAuthorizationAuthentication: M3_3HvH4A3PhaseAExternalHumanAuthorizationAuthenticationV1;
      operationalReadinessDecision: 'READY';
      offlineContractValidated: true;
    }
  | {
      ok: false;
      reasonCode: string;
      p1Authorization: 'NO_GO';
      externalHumanAuthorizationAuthentication?: M3_3HvH4A3PhaseAExternalHumanAuthorizationAuthenticationV1;
      operationalReadinessDecision?: 'READY';
      offlineContractValidated?: true;
    };

export type M3_3HvH4A3PhaseAProductionP1OfflineContractGateResultV1 =
  | { ok: true; operationalReadinessDecision: 'READY' }
  | { ok: false; reasonCode: string };

/**
 * Offline contract validation (readiness, declarative migration boundary, admission pre-check).
 * Success does not authorize production execution.
 */
export function evaluatePhaseAProductionP1OfflineContractGateV1(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  options: { now?: Date } = {},
): M3_3HvH4A3PhaseAProductionP1OfflineContractGateResultV1 {
  const readiness = evaluatePhaseAProductionOperationalReadinessV1(env, options);
  if (readiness.decision !== 'READY') {
    const reasonCode =
      readiness.blockers[0] ?? 'PHASE_A_P1_EXECUTION_OPERATIONAL_READINESS_NO_GO';
    return { ok: false, reasonCode };
  }

  const migration = validatePhaseAProductionMigrationOwnerDeclarativeBoundaryV1(databaseUrl, env);
  if (!migration.ok) {
    return { ok: false, reasonCode: migration.reasonCode };
  }

  const admission = evaluatePhaseAPreflightProductionAdmissionV1(databaseUrl, env, {
    consumeApproval: false,
    now: options.now,
  });
  if (!admission.ok) {
    return { ok: false, reasonCode: admission.reasonCode };
  }

  return { ok: true, operationalReadinessDecision: 'READY' };
}

/**
 * Resolves P1 production execution authorization. Always NO_GO until an independently trusted
 * authorization system is integrated — synthetic JSON, env flags, execute ACK, and nonce cannot promote.
 */
export function resolvePhaseAProductionP1AuthorizationV1(): M3_3HvH4A3PhaseAProductionP1AuthorizationV1 {
  return 'NO_GO';
}

export function isPhaseAProductionP1ExecutionAuthorizedV1(
  gate: M3_3HvH4A3PhaseAProductionP1ExecutionGateResultV1,
): boolean {
  return gate.ok === true && gate.p1Authorization === 'GO';
}

/**
 * Fail-closed gate for production Phase-A execution — no PostgreSQL connect when unauthorized.
 */
export function evaluatePhaseAProductionP1ExecutionGateV1(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  options: { now?: Date } = {},
): M3_3HvH4A3PhaseAProductionP1ExecutionGateResultV1 {
  const offline = evaluatePhaseAProductionP1OfflineContractGateV1(databaseUrl, env, options);
  if (!offline.ok) {
    return { ok: false, reasonCode: offline.reasonCode, p1Authorization: 'NO_GO' };
  }

  const p1Authorization = resolvePhaseAProductionP1AuthorizationV1();
  if (p1Authorization !== 'GO') {
    return {
      ok: false,
      reasonCode: PHASE_A_P1_EXTERNAL_AUTHORIZATION_UNVERIFIED,
      p1Authorization: 'NO_GO',
      externalHumanAuthorizationAuthentication: 'UNVERIFIED',
      operationalReadinessDecision: 'READY',
      offlineContractValidated: true,
    };
  }

  return {
    ok: true,
    p1Authorization: 'GO',
    externalHumanAuthorizationAuthentication: 'TRUSTED_EXTERNAL',
    operationalReadinessDecision: 'READY',
    offlineContractValidated: true,
  };
}
