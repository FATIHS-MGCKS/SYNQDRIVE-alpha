import { PhysicalDeviceAssignmentKind } from '@prisma/client';
import { selectActiveVehicleInstallAssignment } from './physical-device-inventory-p1b2.writes';

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
          id: 'intake',
          assignmentKind: PhysicalDeviceAssignmentKind.INVENTORY_INTAKE,
          vehicleId: null,
          effectiveTo: null,
        },
      ]),
    ).toBeNull();
  });
});
