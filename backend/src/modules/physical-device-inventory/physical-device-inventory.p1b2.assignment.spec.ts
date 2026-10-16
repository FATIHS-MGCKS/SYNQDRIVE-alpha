import { ConflictException } from '@nestjs/common';
import { PhysicalDeviceAssignmentKind } from '@prisma/client';
import { selectActiveVehicleInstallAssignment } from './physical-device-lifecycle.consistency';
import { PHYSICAL_DEVICE_ASSIGNMENT_INTEGRITY_CONFLICT } from './physical-device-inventory.errors';

describe('selectActiveVehicleInstallAssignment', () => {
  it('ignores open INVENTORY_INTAKE rows without vehicle', () => {
    const result = selectActiveVehicleInstallAssignment([
      {
        id: 'intake',
        assignmentKind: PhysicalDeviceAssignmentKind.INVENTORY_INTAKE,
        vehicleId: null,
        effectiveTo: null,
      },
      {
        id: 'install',
        assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
        vehicleId: 'veh-1',
        effectiveTo: null,
      },
    ]);
    expect(result?.id).toBe('install');
  });

  it('returns null when no active install', () => {
    expect(
      selectActiveVehicleInstallAssignment([
        {
          assignmentKind: PhysicalDeviceAssignmentKind.INVENTORY_INTAKE,
          vehicleId: null,
          effectiveTo: null,
        },
      ]),
    ).toBeNull();
  });

  it('throws integrity conflict when multiple active installs', () => {
    let caught: unknown;
    try {
      selectActiveVehicleInstallAssignment([
        {
          assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
          vehicleId: 'v1',
          effectiveTo: null,
        },
        {
          assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
          vehicleId: 'v2',
          effectiveTo: null,
        },
      ]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toMatchObject({
      code: PHYSICAL_DEVICE_ASSIGNMENT_INTEGRITY_CONFLICT,
    });
  });
});
