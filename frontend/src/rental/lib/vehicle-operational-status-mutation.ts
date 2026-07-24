import { api } from '../../lib/api';
import type { VehicleOperationalEditStatus } from './vehicle-operational-state';
import {
  formatVehicleOperationalEditStatusLabel,
  mapVehicleOperationalEditStatusToPrismaStatus,
} from './vehicle-operational-state';
import { classifyVehicleStatusPatchMutationError } from './vehicle-status-patch-mutation-shared';

export type VehicleOperationalStatusMutationLocale = 'de' | 'en';

export interface VehicleOperationalStatusMutationInput {
  orgId: string;
  vehicleId: string;
  editStatus: VehicleOperationalEditStatus;
}

export interface VehicleOperationalStatusMutationResult {
  prismaStatus: ReturnType<typeof mapVehicleOperationalEditStatusToPrismaStatus>;
}

export function shouldWarnBeforeVehicleOperationalStatusChange(
  currentEditStatus: VehicleOperationalEditStatus,
  nextEditStatus: VehicleOperationalEditStatus,
): boolean {
  return (
    currentEditStatus === 'Available' &&
    (nextEditStatus === 'Maintenance' || nextEditStatus === 'Manual Block')
  );
}

export function classifyVehicleOperationalStatusMutationError(
  error: unknown,
  locale: VehicleOperationalStatusMutationLocale = 'de',
): string {
  return classifyVehicleStatusPatchMutationError(error, locale, 'operational');
}

export function vehicleOperationalStatusMutationSuccessMessage(
  editStatus: VehicleOperationalEditStatus,
  locale: VehicleOperationalStatusMutationLocale = 'de',
): string {
  const label = formatVehicleOperationalEditStatusLabel(editStatus, locale);
  return locale === 'de'
    ? `Fahrzeugstatus auf „${label}“ gesetzt.`
    : `Vehicle status set to "${label}".`;
}

export async function mutateVehicleOperationalStatus(
  input: VehicleOperationalStatusMutationInput,
): Promise<VehicleOperationalStatusMutationResult> {
  const prismaStatus = mapVehicleOperationalEditStatusToPrismaStatus(input.editStatus);
  await api.vehicles.updateOperationalStatus(input.orgId, input.vehicleId, {
    status: prismaStatus,
  });
  return { prismaStatus };
}
