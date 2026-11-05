import { buildExecutionVerifiedOeServiceScheduleEuFullDataCallbackForAttestationOnly } from '../catalog/oneauto-execution-verified-registry';
import type { OneAutoExecutionVerifiedProviderContract } from '../catalog/oneauto-contract-types';
import { ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_CANARY_SKU } from './oneauto-oe-service-schedule-attestation-canary.constants';

/** Scoped attestation contract — NOT inserted into global execution-verified registry. */
export function buildAttestationScopedOeServiceScheduleHttpContract(): OneAutoExecutionVerifiedProviderContract {
  return buildExecutionVerifiedOeServiceScheduleEuFullDataCallbackForAttestationOnly();
}

export function isAttestationScopedOeServiceScheduleContract(
  contract: Pick<
    OneAutoExecutionVerifiedProviderContract,
    'serviceSku' | 'providerPathTemplate' | 'httpMethod' | 'asyncCompletionMode'
  >,
): boolean {
  if (contract.serviceSku !== ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_CANARY_SKU) return false;
  const expected = buildAttestationScopedOeServiceScheduleHttpContract();
  return (
    contract.providerPathTemplate === expected.providerPathTemplate &&
    contract.httpMethod === expected.httpMethod &&
    contract.asyncCompletionMode === 'CALLBACK_FULL_DATA'
  );
}
