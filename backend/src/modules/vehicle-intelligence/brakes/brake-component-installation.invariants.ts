import {
  BrakeComponentInstallationAnchorSource,
  BrakeComponentInstallationStatus,
  BrakeComponentInstallationType,
} from '@prisma/client';
import { BRAKE_HEALTH_CONFIG } from './brake-health.config';
import { resolveWearThresholdForInstallation } from './brake-wear-threshold.domain';
import type { BrakeReferenceSpecRecord } from './brake-reference-spec.types';

export const ACTIVE_BRAKE_COMPONENT_UNIQUE_INDEX =
  'brake_component_installations_one_active_per_vehicle_component';

export interface BrakeComponentInstallationRecord {
  id: string;
  organizationId: string;
  vehicleId: string;
  componentType: BrakeComponentInstallationType;
  installedAt: Date;
  installedOdometerKm: number | null;
  removedAt: Date | null;
  removedOdometerKm: number | null;
  status: BrakeComponentInstallationStatus;
}

export interface ValidateBrakeComponentInstallationInput {
  organizationId: string;
  vehicleOrganizationId: string;
  componentType: BrakeComponentInstallationType;
  installedAt: Date;
  installedOdometerKm?: number | null;
  removedAt?: Date | null;
  removedOdometerKm?: number | null;
  status: BrakeComponentInstallationStatus;
  serviceEventId?: string | null;
  serviceEventVehicleId?: string | null;
  sourceEvidenceId?: string | null;
  sourceEvidenceVehicleId?: string | null;
  referenceSpecId?: string | null;
  referenceSpecVehicleId?: string | null;
  allowOdometerReset?: boolean;
  existingActive?: BrakeComponentInstallationRecord | null;
}

export function defaultMinimumThicknessMm(
  componentType: BrakeComponentInstallationType,
  spec?: BrakeReferenceSpecRecord | null,
): number | null {
  const resolved = resolveWearThresholdForInstallation(componentType, spec ?? null);
  if (!resolved || resolved.thresholdMissing) {
    if (
      componentType === BrakeComponentInstallationType.FRONT_DISCS ||
      componentType === BrakeComponentInstallationType.REAR_DISCS
    ) {
      return null;
    }
    return BRAKE_HEALTH_CONFIG.pad.criticalMm;
  }
  return resolved.minimumThicknessMm;
}

export function isActiveBrakeComponentInstallation(
  row: Pick<BrakeComponentInstallationRecord, 'status' | 'removedAt'>,
): boolean {
  return (
    row.status === BrakeComponentInstallationStatus.ACTIVE && row.removedAt == null
  );
}

export function validateBrakeComponentInstallation(
  input: ValidateBrakeComponentInstallationInput,
): void {
  if (input.organizationId !== input.vehicleOrganizationId) {
    throw new Error('organization_vehicle_mismatch');
  }

  if (
    input.status === BrakeComponentInstallationStatus.ACTIVE &&
    input.existingActive &&
    input.existingActive.status === BrakeComponentInstallationStatus.ACTIVE
  ) {
    throw new Error('duplicate_active_component_installation');
  }

  if (input.removedAt && input.removedAt < input.installedAt) {
    throw new Error('removed_before_installed');
  }

  if (
    input.installedOdometerKm != null &&
    input.removedOdometerKm != null &&
    input.removedOdometerKm < input.installedOdometerKm &&
    !input.allowOdometerReset
  ) {
    throw new Error('removed_odometer_before_installed_odometer');
  }
}

export function validateServiceEventReference(
  vehicleId: string,
  serviceEventVehicleId?: string | null,
): void {
  if (serviceEventVehicleId && serviceEventVehicleId !== vehicleId) {
    throw new Error('service_event_vehicle_mismatch');
  }
}

export function validateEvidenceReference(
  vehicleId: string,
  evidenceVehicleId?: string | null,
): void {
  if (evidenceVehicleId && evidenceVehicleId !== vehicleId) {
    throw new Error('evidence_vehicle_mismatch');
  }
}

export function validateReferenceSpecReference(
  vehicleId: string,
  specVehicleId?: string | null,
): void {
  if (specVehicleId && specVehicleId !== vehicleId) {
    throw new Error('reference_spec_vehicle_mismatch');
  }
}

export function sortInstallationsByHistory<T extends { installedAt: Date }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => a.installedAt.getTime() - b.installedAt.getTime());
}

export function mapLifecycleScopeToComponentType(
  scope: string,
): BrakeComponentInstallationType | null {
  const key = scope.trim().toUpperCase();
  switch (key) {
    case 'FRONT_PADS':
    case 'FRONT_PAD':
      return BrakeComponentInstallationType.FRONT_PADS;
    case 'REAR_PADS':
    case 'REAR_PAD':
      return BrakeComponentInstallationType.REAR_PADS;
    case 'FRONT_DISCS':
    case 'FRONT_DISC':
      return BrakeComponentInstallationType.FRONT_DISCS;
    case 'REAR_DISCS':
    case 'REAR_DISC':
      return BrakeComponentInstallationType.REAR_DISCS;
    default:
      return null;
  }
}

export function isPrismaActiveComponentConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; meta?: { target?: string | string[] } };
  if (err.code !== 'P2002') return false;
  const target = err.meta?.target;
  if (Array.isArray(target)) {
    return target.includes(ACTIVE_BRAKE_COMPONENT_UNIQUE_INDEX);
  }
  return String(target ?? '').includes(ACTIVE_BRAKE_COMPONENT_UNIQUE_INDEX);
}
