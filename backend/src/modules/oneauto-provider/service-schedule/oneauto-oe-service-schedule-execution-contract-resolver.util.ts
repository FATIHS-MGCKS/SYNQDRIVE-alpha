import type { OneAutoExecutionAuthorizationMode } from '@prisma/client';
import type { OneAutoExecutionVerifiedProviderContract } from '../catalog/oneauto-contract-types';
import { getVerifiedOneAutoContract } from '../catalog/oneauto-verified-contracts';
import { buildAttestationScopedOeServiceScheduleHttpContract } from './oneauto-oe-service-schedule-attestation-contract.util';
import { ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU } from './oneauto-service-schedule-eu.types';

export function resolveOneAutoExecutionContractForJob(job: {
  serviceSku: string;
  executionAuthorizationMode: OneAutoExecutionAuthorizationMode;
}): OneAutoExecutionVerifiedProviderContract | undefined {
  if (job.executionAuthorizationMode === 'ATTESTATION_CANARY') {
    if (job.serviceSku !== ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU) {
      return undefined;
    }
    return buildAttestationScopedOeServiceScheduleHttpContract();
  }
  return getVerifiedOneAutoContract(job.serviceSku);
}
