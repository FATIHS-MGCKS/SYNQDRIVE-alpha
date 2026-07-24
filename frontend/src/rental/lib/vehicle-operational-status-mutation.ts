import { api } from '../../lib/api';
import type { VehicleOperationalEditStatus } from './vehicle-operational-state';
import {
  formatVehicleOperationalEditStatusLabel,
  mapVehicleOperationalEditStatusToPrismaStatus,
} from './vehicle-operational-state';

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
  const message = error instanceof Error ? error.message : '';
  const lower = message.toLowerCase();
  const de = locale === 'de';

  if (lower.includes('session expired') || lower.includes('401')) {
    return de ? 'Sitzung abgelaufen. Bitte erneut anmelden.' : 'Session expired. Please sign in again.';
  }
  if (lower.includes('403') || lower.includes('forbidden') || lower.includes('permission')) {
    return de
      ? 'Keine Berechtigung zum Ändern des Fahrzeugstatus.'
      : 'You do not have permission to change the vehicle status.';
  }
  if (lower.includes('404') || lower.includes('not found')) {
    return de
      ? 'Fahrzeug nicht gefunden oder gehört nicht zu dieser Organisation.'
      : 'Vehicle not found or does not belong to this organization.';
  }
  if (
    lower.includes('cannot be set via the admin status endpoint') ||
    lower.includes('rented') ||
    lower.includes('reserved')
  ) {
    return de
      ? 'Dieser Status kann nicht direkt gesetzt werden. Vermietet/Reserviert entsteht über Buchungen.'
      : 'This status cannot be set directly. Rented/Reserved are derived from bookings.';
  }
  if (lower.includes('400') || lower.includes('bad request') || lower.includes('validation')) {
    return de ? 'Ungültiger Statuswechsel.' : 'Invalid status transition.';
  }
  return de
    ? 'Fahrzeugstatus konnte nicht gespeichert werden.'
    : 'Vehicle status could not be saved.';
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
