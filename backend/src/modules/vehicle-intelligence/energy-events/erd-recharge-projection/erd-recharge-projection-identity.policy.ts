import {
  ERD_RECHARGE_PHYSICAL_PROJECTION_KEY_PREFIX,
  ERD_RECHARGE_PROJECTION_IDENTITY_VERSION,
} from './erd-recharge-projection.constants';

const MAX_SOURCE_EVENT_KEY_LENGTH = 512;

export interface ErdRechargeProjectionIdentityInput {
  vehicleId: string;
  /** Immutable anchor — typically `HvChargeSession.segmentFingerprint` at first projection mint. */
  anchorSegmentFingerprint: string;
}

/**
 * Stable VehicleEnergyEvent.sourceEventKey for one physical recharge episode.
 * Survives fallback → native canonicalChargeSessionId handoff (E5.3); must not be rewritten on handoff.
 */
export function buildErdRechargePhysicalProjectionSourceEventKey(
  input: ErdRechargeProjectionIdentityInput,
): string {
  const key = `${ERD_RECHARGE_PHYSICAL_PROJECTION_KEY_PREFIX}${input.vehicleId}:${input.anchorSegmentFingerprint}`;
  if (key.length > MAX_SOURCE_EVENT_KEY_LENGTH) {
    throw new Error('erd_recharge_projection_source_event_key_too_long');
  }
  return key;
}

export function describeErdRechargeProjectionIdentityContract(): {
  version: typeof ERD_RECHARGE_PROJECTION_IDENTITY_VERSION;
  sourceEventKeyFormat: string;
  sourceEventKeyImmutableAfterMint: true;
  veeRowIdImmutableAcrossAuthorityHandoff: true;
  canonicalChargeSessionIdReassignableWithoutNewVee: true;
  maxSourceEventKeyLength: number;
  collisionDomain: 'vehicleId + anchorSegmentFingerprint';
} {
  return {
    version: ERD_RECHARGE_PROJECTION_IDENTITY_VERSION,
    sourceEventKeyFormat: `${ERD_RECHARGE_PHYSICAL_PROJECTION_KEY_PREFIX}{vehicleId}:{anchorSegmentFingerprint}`,
    sourceEventKeyImmutableAfterMint: true,
    veeRowIdImmutableAcrossAuthorityHandoff: true,
    canonicalChargeSessionIdReassignableWithoutNewVee: true,
    maxSourceEventKeyLength: MAX_SOURCE_EVENT_KEY_LENGTH,
    collisionDomain: 'vehicleId + anchorSegmentFingerprint',
  };
}
