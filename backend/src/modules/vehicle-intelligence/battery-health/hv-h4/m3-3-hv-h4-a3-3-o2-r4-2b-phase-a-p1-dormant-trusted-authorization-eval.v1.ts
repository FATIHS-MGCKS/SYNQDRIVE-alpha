import { verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.verify-offline.v1';
import type { M3_3HvH4A3PhaseAP1TrustedAuthorizationOfflineVerifyResultV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.types.v1';
export const PHASE_A_P1_DORMANT_EXECUTION_DISABLED = 'PHASE_A_P1_DORMANT_EXECUTION_DISABLED' as const;

export type M3_3HvH4A3PhaseAP1DormantTrustedAuthorizationEvalResultV1 = {
  advisoryOnly: true;
  p1ExecutionAuthorization: 'NO_GO';
  dormantReasonCode: typeof PHASE_A_P1_DORMANT_EXECUTION_DISABLED;
  deploymentIdentityVerified: false;
  offlineCryptographicVerification: M3_3HvH4A3PhaseAP1TrustedAuthorizationOfflineVerifyResultV1;
  runtimeP1AuthorizationResolver: 'NO_GO';
};

/**
 * P1B1-A0 advisory boundary: may run offline verifier for diagnostics only.
 * Never promotes production execution — `resolvePhaseAProductionP1AuthorizationV1` stays NO_GO.
 */
export function evaluatePhaseAProductionP1DormantTrustedAuthorizationV1(
  artifactInput: unknown,
  trustStoreInput: unknown,
  contextInput: unknown,
  options: { now?: Date } = {},
): M3_3HvH4A3PhaseAP1DormantTrustedAuthorizationEvalResultV1 {
  const offlineCryptographicVerification = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
    artifactInput,
    trustStoreInput,
    contextInput,
    options,
  );

  return {
    advisoryOnly: true,
    p1ExecutionAuthorization: 'NO_GO',
    dormantReasonCode: PHASE_A_P1_DORMANT_EXECUTION_DISABLED,
    deploymentIdentityVerified: false,
    offlineCryptographicVerification,
    runtimeP1AuthorizationResolver: 'NO_GO',
  };
}
