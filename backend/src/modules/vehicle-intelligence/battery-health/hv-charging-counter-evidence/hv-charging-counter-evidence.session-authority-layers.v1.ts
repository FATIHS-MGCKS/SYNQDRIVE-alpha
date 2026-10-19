import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';

export type HvPhysicalSessionValidityV1 =
  | 'VALID_CLOSED_NATIVE_RECHARGE'
  | 'INVALID_ONGOING'
  | 'INVALID_NON_NATIVE_SOURCE'
  | 'INVALID_MISSING_END';

export type HvScientificQualityLayerV1 = {
  /** H4/HV scientific contract — read-only mirror of persisted session metadata. */
  qualityStatus: string | null;
  reasonCodes: string[];
  h4ThroughputEligible: boolean;
};

export interface HvSessionAuthorityLayersInputV1 {
  source: string;
  isOngoing: boolean;
  endAt: Date | null;
  metadata: unknown;
}

export function resolveHvPhysicalSessionValidityV1(
  input: HvSessionAuthorityLayersInputV1,
): HvPhysicalSessionValidityV1 {
  if (input.isOngoing || !input.endAt) {
    return 'INVALID_ONGOING';
  }
  if (input.source !== HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE) {
    return 'INVALID_NON_NATIVE_SOURCE';
  }
  return 'VALID_CLOSED_NATIVE_RECHARGE';
}

export function resolveHvScientificQualityLayerV1(
  metadata: unknown,
): HvScientificQualityLayerV1 {
  const meta = (metadata ?? {}) as HvChargeSessionMetadata;
  const qualityStatus = meta.qualityStatus ?? null;
  const reasonCodes = [...(meta.qualityReasonCodes ?? [])];
  const h4ThroughputEligible = qualityStatus === HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED;
  return { qualityStatus, reasonCodes, h4ThroughputEligible };
}
