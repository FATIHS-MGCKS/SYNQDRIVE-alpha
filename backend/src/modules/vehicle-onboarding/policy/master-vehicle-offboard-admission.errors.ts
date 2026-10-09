import { ConflictException } from '@nestjs/common';
import type { MasterVehicleOffboardAdmissionBlockReason } from './master-vehicle-offboard-admission.config';

export const MASTER_VEHICLE_OFFBOARD_ADMISSION_DISABLED_CODE =
  'MASTER_VEHICLE_OFFBOARD_ADMISSION_DISABLED';

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
