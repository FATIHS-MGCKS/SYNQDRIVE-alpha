import { DeviceConnectionPhysicalAuthorityMode } from '@prisma/client';
import { isLegacyObdPersistenceExcludedByAuthority } from './physical-state-authority-cutover.types';
import { shouldPersistObdPlugStateChange } from '../device-connection-webhook.service';

describe('physical webhook authority routing (P25-H)', () => {
  it('shouldPersistObdPlugStateChange may still evaluate transitions for shadow compare', () => {
    expect(shouldPersistObdPlugStateChange(true, null)).toEqual({
      persist: false,
      reason: 'baseline_already_plugged',
    });
  });

  it('legacy persistence is structurally excluded when authority is PHYSICAL', () => {
    expect(
      isLegacyObdPersistenceExcludedByAuthority(DeviceConnectionPhysicalAuthorityMode.PHYSICAL),
    ).toBe(true);
    expect(
      isLegacyObdPersistenceExcludedByAuthority(DeviceConnectionPhysicalAuthorityMode.LEGACY),
    ).toBe(false);
  });
});
