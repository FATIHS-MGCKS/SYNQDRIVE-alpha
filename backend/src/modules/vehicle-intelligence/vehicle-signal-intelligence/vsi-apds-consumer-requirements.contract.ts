/**
 * APDS read-only demand/requirements contract (P4 design — not wired to shadow path).
 */
import { VSI_APDS_ADAPTER_CONTRACT_VERSION } from './vsi-apds-consumer.adapter.contract';

export const VSI_APDS_REQUIREMENTS_CONTRACT_VERSION = 'vsi-apds-requirements-v1' as const;

export const VSI_APDS_CONSUMER_FEATURES = {
  SHADOW_DEMAND_PROFILE_READ: 'shadow_demand_profile_read',
} as const;

export type VsiApdsReadonlyRequirementsContractV1 = {
  adapterContractVersion: typeof VSI_APDS_ADAPTER_CONTRACT_VERSION;
  requirementsContractVersion: typeof VSI_APDS_REQUIREMENTS_CONTRACT_VERSION;
  featureId: typeof VSI_APDS_CONSUMER_FEATURES.SHADOW_DEMAND_PROFILE_READ;
  limitations: readonly string[];
};

export function describeVsiApdsReadonlyRequirementsContract(): VsiApdsReadonlyRequirementsContractV1 {
  return {
    adapterContractVersion: VSI_APDS_ADAPTER_CONTRACT_VERSION,
    requirementsContractVersion: VSI_APDS_REQUIREMENTS_CONTRACT_VERSION,
    featureId: VSI_APDS_CONSUMER_FEATURES.SHADOW_DEMAND_PROFILE_READ,
    limitations: [
      'NOT_WIRED_TO_APDS_SHADOW_DECISION_PATH',
      'NO_POLLING_POLICY_CHANGES_IN_P4',
      'P5A_READONLY_ADAPTER_vsi-apds-p5-readonly-v1',
      'P5B_RUNTIME_GATE_VSI_P5_APDS_CORRELATION_ENABLED_DEFAULT_OFF',
    ],
  };
}
