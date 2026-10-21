import {
  buildErdRechargePhysicalProjectionSourceEventKey,
  describeErdRechargeProjectionIdentityContract,
} from './erd-recharge-projection-identity.policy';
import { ERD_RECHARGE_PHYSICAL_PROJECTION_KEY_PREFIX } from './erd-recharge-projection.constants';

describe('erd-recharge-projection-identity.policy', () => {
  it('builds stable v1 sourceEventKey', () => {
    const vehicleId = 'veh-abc';
    const fp = 'poll-charge:veh-abc:12345';
    const key = buildErdRechargePhysicalProjectionSourceEventKey({
      vehicleId,
      anchorSegmentFingerprint: fp,
    });
    expect(key).toBe(`${ERD_RECHARGE_PHYSICAL_PROJECTION_KEY_PREFIX}${vehicleId}:${fp}`);
    expect(key.length).toBeLessThanOrEqual(512);
  });

  it('documents immutable identity contract', () => {
    const contract = describeErdRechargeProjectionIdentityContract();
    expect(contract.version).toBe('v1');
    expect(contract.sourceEventKeyImmutableAfterMint).toBe(true);
    expect(contract.veeRowIdImmutableAcrossAuthorityHandoff).toBe(true);
    expect(contract.canonicalChargeSessionIdReassignableWithoutNewVee).toBe(true);
  });
});
