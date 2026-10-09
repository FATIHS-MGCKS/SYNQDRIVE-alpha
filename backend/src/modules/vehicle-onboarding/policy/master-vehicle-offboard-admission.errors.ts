import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { MasterVehicleOffboardAdmissionBlockReason } from './master-vehicle-offboard-admission.config';

export const MASTER_VEHICLE_OFFBOARD_ADMISSION_DISABLED_CODE =
  'MASTER_VEHICLE_OFFBOARD_ADMISSION_DISABLED';

export const MASTER_VEHICLE_OFFBOARD_PLATFORM_MASTER_ADMIN_REQUIRED_CODE =
  'MASTER_VEHICLE_OFFBOARD_PLATFORM_MASTER_ADMIN_REQUIRED';

export function masterVehicleOffboardPlatformMasterAdminRequiredException(): ForbiddenException {
  return new ForbiddenException({
    code: MASTER_VEHICLE_OFFBOARD_PLATFORM_MASTER_ADMIN_REQUIRED_CODE,
    message:
      'Canonical Master Admin vehicle offboard HTTP requires platformRole MASTER_ADMIN; membership-only role claims are not sufficient.',
  });
}

export function masterVehicleOffboardAdmissionDisabledException(
  blockReason: MasterVehicleOffboardAdmissionBlockReason,
): ConflictException {
  return new ConflictException({
    code: MASTER_VEHICLE_OFFBOARD_ADMISSION_DISABLED_CODE,
    blockReason,
    message:
      'Master Admin vehicle offboard HTTP is not admitted for this deployment. Enable server admission, route verification, release attestation, and Master Admin MFA rollout per VO5C-P4A runbook.',
  });
}
