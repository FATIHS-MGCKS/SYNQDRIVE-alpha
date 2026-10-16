import { PhysicalDeviceAssignmentKind, PhysicalDeviceInventoryStatus } from '@prisma/client';
import { assertDeviceInstallStatusConsistency } from './physical-device-lifecycle.consistency';
import { PHYSICAL_DEVICE_STATUS_ASSIGNMENT_INCONSISTENT } from './physical-device-inventory.errors';

describe('assertDeviceInstallStatusConsistency', () => {
  it('rejects INSTALLED without active install', () => {
    expect(() =>
      assertDeviceInstallStatusConsistency(PhysicalDeviceInventoryStatus.INSTALLED, []),
    ).toThrow(
      expect.objectContaining({
        response: {
          code: PHYSICAL_DEVICE_STATUS_ASSIGNMENT_INCONSISTENT,
          reasonCode: 'INSTALLED_REQUIRES_ONE_ACTIVE_INSTALL',
        },
      }),
    );
  });

  it('rejects LOST candidate while status still INSTALLED with active install', () => {
    expect(() =>
      assertDeviceInstallStatusConsistency(PhysicalDeviceInventoryStatus.INSTALLED, [
        {
          assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
          vehicleId: 'veh-1',
          effectiveTo: null,
        },
      ]),
    ).not.toThrow();
  });
});
