import { commitPhaseAProductionApprovalConsumptionV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-admission.v1';
import type { M3_3HvH4A3PhaseAProductionAdmissionResultV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-admission.v1';
import {
  capturePhaseAProductionSessionIdentityV1,
  validatePhaseAProductionSessionIdentityAgainstSpecV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-session-identity.v1';
import {
  evaluatePhaseAProductionTlsIdentityInSessionV1,
  readPhaseAProductionBackendPidV1,
  type PhaseAProductionSqlQueryableV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-tls-identity.v1';
import { parsePhaseAProductionTargetSpecFromEnvV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-target.v1';

export type PhaseAProductionSameSessionGateSuccessV1 = {
  ok: true;
  anchorBackendPid: number;
  tlsIdentityCertified: boolean;
  sessionUser: string;
  currentUser: string;
  executeConsumedAt: string;
};

export type PhaseAProductionSameSessionGateOutcomeV1 =
  | PhaseAProductionSameSessionGateSuccessV1
  | { ok: false; reasonCode: string };

/**
 * Production TLS + identity gates inside the same READ ONLY transaction connection as discovery.
 */
export async function runPhaseAProductionSameSessionGateV1(
  tx: PhaseAProductionSqlQueryableV1,
  databaseUrl: string,
  env: NodeJS.ProcessEnv,
  admissionReady: Extract<M3_3HvH4A3PhaseAProductionAdmissionResultV1, { ok: true }>,
  consumedAt: Date,
): Promise<PhaseAProductionSameSessionGateOutcomeV1> {
  const specParsed = parsePhaseAProductionTargetSpecFromEnvV1(env);
  if (!specParsed.ok) {
    return specParsed;
  }

  const anchorBackendPid = await readPhaseAProductionBackendPidV1(tx);

  const tls = await evaluatePhaseAProductionTlsIdentityInSessionV1(
    tx,
    databaseUrl,
    anchorBackendPid,
  );
  if (!tls.ok) {
    return tls;
  }

  const identity = await capturePhaseAProductionSessionIdentityV1(tx);
  const identityOk = validatePhaseAProductionSessionIdentityAgainstSpecV1(
    identity,
    specParsed.spec,
  );
  if (!identityOk.ok) {
    return identityOk;
  }

  const pidAfterIdentity = await readPhaseAProductionBackendPidV1(tx);
  if (pidAfterIdentity !== anchorBackendPid) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_SESSION_PID_MISMATCH' };
  }

  if (!tls.certification.tlsIdentityCertified) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_TLS_IDENTITY_NOT_CERTIFIED' };
  }

  const consumed = commitPhaseAProductionApprovalConsumptionV1(admissionReady, consumedAt);
  if (!consumed.ok) {
    return consumed;
  }

  return {
    ok: true,
    anchorBackendPid,
    tlsIdentityCertified: true,
    sessionUser: identity.sessionUser,
    currentUser: identity.currentUser,
    executeConsumedAt: consumed.executeConsumedAt,
  };
}
