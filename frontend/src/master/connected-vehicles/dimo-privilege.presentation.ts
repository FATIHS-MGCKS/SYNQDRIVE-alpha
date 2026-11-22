import type { StatusTone } from '../../components/patterns';
import type {
  DimoPrivilegeProviderCheckStatus,
  DimoPrivilegeVehicleVerificationStatus,
  OrganizationDimoPrivilegeStatusDto,
  OrganizationDimoPrivilegeVehicleRow,
} from './dimo-privilege.types';

export const ACTIVE_OFFBOARDING_JOB_STATUSES = ['PREPARED', 'RETRYABLE', 'FAILED'] as const;

export type ActiveOffboardingJobStatus = (typeof ACTIVE_OFFBOARDING_JOB_STATUSES)[number];

export function isActiveOffboardingJobStatus(
  jobStatus: string | null,
): jobStatus is ActiveOffboardingJobStatus {
  if (!jobStatus) return false;
  return (ACTIVE_OFFBOARDING_JOB_STATUSES as readonly string[]).includes(jobStatus);
}

export function shouldShowDimoPermissionsPanel(status: OrganizationDimoPrivilegeStatusDto | null): boolean {
  if (!status?.jobId) return false;
  return isActiveOffboardingJobStatus(status.jobStatus);
}

export function pickVehiclePrivilegeRow(
  vehicles: OrganizationDimoPrivilegeVehicleRow[],
  vehicleId: string | null,
): OrganizationDimoPrivilegeVehicleRow | null {
  if (!vehicleId) return null;
  return vehicles.find((row) => row.vehicleId === vehicleId) ?? null;
}

export function providerCheckStatusTone(status: DimoPrivilegeProviderCheckStatus): StatusTone {
  switch (status) {
    case 'CONFIRMED_ABSENT':
      return 'success';
    case 'PRIVILEGE_STILL_ACTIVE':
      return 'critical';
    case 'REVIEW_REQUIRED':
      return 'warning';
    case 'NOT_AVAILABLE':
      return 'info';
    case 'NO_DIMO_DEPENDENCY':
      return 'neutral';
    case 'NOT_VERIFIED':
    default:
      return 'noData';
  }
}

export function vehicleVerificationTone(status: DimoPrivilegeVehicleVerificationStatus): StatusTone {
  switch (status) {
    case 'VERIFIED_ABSENT':
      return 'success';
    case 'VERIFIED_STILL_PRIVILEGED':
      return 'critical';
    case 'REVIEW_REQUIRED':
      return 'warning';
    case 'UNVERIFIED':
    default:
      return 'noData';
  }
}

export function stillPrivilegedTone(value: boolean | null): StatusTone {
  if (value === true) return 'critical';
  if (value === false) return 'success';
  return 'noData';
}

export type VehicleOwnerActionDisposition = 'required' | 'cleared' | 'unknown' | 'not_in_inventory';

export function resolveVehicleOwnerActionDisposition(
  row: OrganizationDimoPrivilegeVehicleRow | null,
): VehicleOwnerActionDisposition {
  if (!row) return 'not_in_inventory';
  if (row.stillPrivileged === true) return 'required';
  if (row.verificationStatus === 'VERIFIED_STILL_PRIVILEGED' || row.verificationStatus === 'REVIEW_REQUIRED') {
    return 'required';
  }
  if (row.verificationStatus === 'VERIFIED_ABSENT' && row.stillPrivileged === false) {
    return 'cleared';
  }
  return 'unknown';
}

export function vehicleRequiresOwnerAction(row: OrganizationDimoPrivilegeVehicleRow | null): boolean {
  return resolveVehicleOwnerActionDisposition(row) === 'required';
}

export function canOfferVehicleScopedMutations(row: OrganizationDimoPrivilegeVehicleRow | null): boolean {
  return row !== null;
}

export function recheckGateAppearsOff(detailCode: string | null | undefined): boolean {
  return detailCode === 'DIMO_PRIVILEGE_RECHECK_NOT_ARMED';
}

export function formatDimoTokenId(tokenId: number | null, maskedFallback: string | null | undefined): string {
  if (maskedFallback) return maskedFallback;
  if (tokenId == null) return '—';
  const raw = String(tokenId);
  if (raw.length <= 4) return `…${raw}`;
  return `…${raw.slice(-4)}`;
}