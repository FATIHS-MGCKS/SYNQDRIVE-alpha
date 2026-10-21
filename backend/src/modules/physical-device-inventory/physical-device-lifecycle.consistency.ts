import {
  PhysicalDeviceAssignmentKind,
  PhysicalDeviceInventoryStatus,
} from '@prisma/client';
import {
  physicalDeviceActiveVehicleAssignment,
  physicalDeviceAssignmentIntegrityConflict,
  physicalDeviceStatusAssignmentInconsistent,
} from './physical-device-inventory.errors';

export type AssignmentRow = {
  assignmentKind: PhysicalDeviceAssignmentKind;
  vehicleId: string | null;
  effectiveTo: Date | null;
  organizationId?: string | null;
};

export function listActiveVehicleInstallAssignments<T extends AssignmentRow>(assignments: T[]): T[] {
  return assignments.filter(
    (a) =>
      a.assignmentKind === PhysicalDeviceAssignmentKind.INSTALL &&
      a.vehicleId != null &&
      a.effectiveTo == null,
  );
}

/** Read-only: null when zero active installs; throws when more than one. */
export function selectActiveVehicleInstallAssignment<T extends AssignmentRow>(
  assignments: T[],
): T | null {
  const active = listActiveVehicleInstallAssignments(assignments);
  if (active.length > 1) {
    throw physicalDeviceAssignmentIntegrityConflict();
  }
  return active[0] ?? null;
}

export function requireActiveVehicleInstallAssignment<T extends AssignmentRow>(
  assignments: T[],
): T {
  const active = listActiveVehicleInstallAssignments(assignments);
  if (active.length > 1) {
    throw physicalDeviceAssignmentIntegrityConflict();
  }
  if (active.length === 0) {
    throw physicalDeviceActiveVehicleAssignment();
  }
  return active[0];
}

export function assertNoActiveVehicleInstall(assignments: AssignmentRow[]): void {
  const active = listActiveVehicleInstallAssignments(assignments);
  if (active.length > 1) {
    throw physicalDeviceAssignmentIntegrityConflict();
  }
  if (active.length === 1) {
    throw physicalDeviceActiveVehicleAssignment();
  }
}

export function assertDeviceInstallStatusConsistency(
  status: PhysicalDeviceInventoryStatus,
  assignments: AssignmentRow[],
): void {
  const active = listActiveVehicleInstallAssignments(assignments);
  if (active.length > 1) {
    throw physicalDeviceAssignmentIntegrityConflict();
  }
  if (status === PhysicalDeviceInventoryStatus.INSTALLED) {
    if (active.length !== 1) {
      throw physicalDeviceStatusAssignmentInconsistent('INSTALLED_REQUIRES_ONE_ACTIVE_INSTALL');
    }
    return;
  }
  if (active.length === 1) {
    throw physicalDeviceStatusAssignmentInconsistent('NON_INSTALLED_WITH_ACTIVE_INSTALL');
  }
}

export function assertOwnerOrganizationMatchesVehicle(
  deviceOwnerOrganizationId: string | null,
  vehicleOrganizationId: string,
): void {
  if (deviceOwnerOrganizationId && deviceOwnerOrganizationId !== vehicleOrganizationId) {
    throw physicalDeviceStatusAssignmentInconsistent('DEVICE_VEHICLE_ORG_MISMATCH');
  }
}
