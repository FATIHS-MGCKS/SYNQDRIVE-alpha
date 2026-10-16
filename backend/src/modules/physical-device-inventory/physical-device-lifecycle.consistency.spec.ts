import { ConflictException } from '@nestjs/common';
import { PhysicalDeviceAssignmentKind, PhysicalDeviceInventoryStatus } from '@prisma/client';
import { assertDeviceInstallStatusConsistency } from './physical-device-lifecycle.consistency';
import { PHYSICAL_DEVICE_STATUS_ASSIGNMENT_INCONSISTENT } from './physical-device-inventory.errors';

describe('assertDeviceInstallStatusConsistency', () => {
  it('rejects INSTALLED without active install', () => {
    try {
      assertDeviceInstallStatusConsistency(PhysicalDeviceInventoryStatus.INSTALLED, []);
      throw new Error('expected ConflictException');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ConflictException);
      const body = (error as ConflictException).getResponse() as {
        code: string;
        reasonCode: string;
      };
      expect(body.code).toBe(PHYSICAL_DEVICE_STATUS_ASSIGNMENT_INCONSISTENT);
      expect(body.reasonCode).toBe('INSTALLED_REQUIRES_ONE_ACTIVE_INSTALL');
    }
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
