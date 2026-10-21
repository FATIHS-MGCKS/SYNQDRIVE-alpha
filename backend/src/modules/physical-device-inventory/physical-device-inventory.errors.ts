import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

export const PHYSICAL_DEVICE_SERIAL_CONFLICT = 'PHYSICAL_DEVICE_SERIAL_ALREADY_REGISTERED';
export const PHYSICAL_DEVICE_IMEI_CONFLICT = 'PHYSICAL_DEVICE_IMEI_ALREADY_REGISTERED';
export const PHYSICAL_DEVICE_OWNER_ORG_NOT_FOUND = 'PHYSICAL_DEVICE_OWNER_ORG_NOT_FOUND';
export const PHYSICAL_DEVICE_IDEMPOTENCY_PAYLOAD_MISMATCH =
  'PHYSICAL_DEVICE_IDEMPOTENCY_PAYLOAD_MISMATCH';

export function physicalDeviceSerialConflict() {
  return new ConflictException({
    code: PHYSICAL_DEVICE_SERIAL_CONFLICT,
    message: 'A physical device with this serial number is already in inventory',
  });
}

export function physicalDeviceImeiConflict() {
  return new ConflictException({
    code: PHYSICAL_DEVICE_IMEI_CONFLICT,
    message: 'A physical device with this IMEI is already in inventory',
  });
}

export function physicalDeviceOwnerOrgNotFound() {
  return new NotFoundException({
    code: PHYSICAL_DEVICE_OWNER_ORG_NOT_FOUND,
    message: 'Owner organization was not found',
  });
}

export function physicalDeviceIdempotencyPayloadMismatch() {
  return new ConflictException({
    code: PHYSICAL_DEVICE_IDEMPOTENCY_PAYLOAD_MISMATCH,
    message: 'Idempotency key was already used with a different intake payload',
  });
}

export const PHYSICAL_DEVICE_P1B1_WRITES_DISABLED = 'PHYSICAL_DEVICE_P1B1_WRITES_DISABLED';
export const PHYSICAL_DEVICE_NOT_FOUND = 'PHYSICAL_DEVICE_NOT_FOUND';
export const PHYSICAL_DEVICE_IDENTITY_EVIDENCE_INSUFFICIENT =
  'PHYSICAL_DEVICE_IDENTITY_EVIDENCE_INSUFFICIENT';
export const PHYSICAL_DEVICE_NOT_INSTALL_ELIGIBLE = 'PHYSICAL_DEVICE_NOT_INSTALL_ELIGIBLE';
export const PHYSICAL_DEVICE_ALREADY_INSTALLED = 'PHYSICAL_DEVICE_ALREADY_INSTALLED';
export const PHYSICAL_DEVICE_VEHICLE_NOT_ELIGIBLE = 'PHYSICAL_DEVICE_VEHICLE_NOT_ELIGIBLE';
export const PHYSICAL_DEVICE_VEHICLE_ORG_MISMATCH = 'PHYSICAL_DEVICE_VEHICLE_ORG_MISMATCH';
export const PHYSICAL_DEVICE_REVIEWER_MISMATCH = 'PHYSICAL_DEVICE_REVIEWER_MISMATCH';

export function physicalDeviceP1b1WritesDisabled() {
  return new ForbiddenException({
    code: PHYSICAL_DEVICE_P1B1_WRITES_DISABLED,
    message: 'Physical device inventory P1B.1 write workflows are disabled',
  });
}

export function physicalDeviceNotFound() {
  return new NotFoundException({
    code: PHYSICAL_DEVICE_NOT_FOUND,
    message: 'Physical device was not found',
  });
}

export function physicalDeviceIdentityEvidenceInsufficient(reasonCode: string) {
  return new UnprocessableEntityException({
    code: PHYSICAL_DEVICE_IDENTITY_EVIDENCE_INSUFFICIENT,
    message: 'Identity verification evidence is insufficient',
    reasonCode,
  });
}

export function physicalDeviceNotInstallEligible(reasonCode: string) {
  return new UnprocessableEntityException({
    code: PHYSICAL_DEVICE_NOT_INSTALL_ELIGIBLE,
    message: 'Physical device is not eligible for installation',
    reasonCode,
  });
}

export function physicalDeviceAlreadyInstalled() {
  return new ConflictException({
    code: PHYSICAL_DEVICE_ALREADY_INSTALLED,
    message: 'Physical device already has an active vehicle installation',
  });
}

export function physicalDeviceVehicleNotEligible(reasonCode: string) {
  return new UnprocessableEntityException({
    code: PHYSICAL_DEVICE_VEHICLE_NOT_ELIGIBLE,
    message: 'Target vehicle is not eligible for physical device installation',
    reasonCode,
  });
}

export function physicalDeviceVehicleOrgMismatch() {
  return new ConflictException({
    code: PHYSICAL_DEVICE_VEHICLE_ORG_MISMATCH,
    message: 'Vehicle organization does not match device owner scope',
  });
}

export function physicalDeviceReviewerMismatch() {
  return new ConflictException({
    code: PHYSICAL_DEVICE_REVIEWER_MISMATCH,
    message: 'Reviewer attestation must match the authenticated master admin',
  });
}

export const PHYSICAL_DEVICE_P1B2_WRITES_DISABLED = 'PHYSICAL_DEVICE_P1B2_WRITES_DISABLED';
export const PHYSICAL_DEVICE_NOT_UNINSTALL_ELIGIBLE = 'PHYSICAL_DEVICE_NOT_UNINSTALL_ELIGIBLE';
export const PHYSICAL_DEVICE_ASSIGNMENT_MISMATCH = 'PHYSICAL_DEVICE_ASSIGNMENT_MISMATCH';
export const PHYSICAL_DEVICE_NOT_INSTALLED = 'PHYSICAL_DEVICE_NOT_INSTALLED';
export const PHYSICAL_DEVICE_LIFECYCLE_NOT_ELIGIBLE = 'PHYSICAL_DEVICE_LIFECYCLE_NOT_ELIGIBLE';
export const PHYSICAL_DEVICE_LOSS_EVIDENCE_INSUFFICIENT = 'PHYSICAL_DEVICE_LOSS_EVIDENCE_INSUFFICIENT';
export const PHYSICAL_DEVICE_ACTIVE_VEHICLE_ASSIGNMENT =
  'PHYSICAL_DEVICE_ACTIVE_VEHICLE_ASSIGNMENT';
export const PHYSICAL_DEVICE_ASSIGNMENT_INTEGRITY_CONFLICT =
  'PHYSICAL_DEVICE_ASSIGNMENT_INTEGRITY_CONFLICT';
export const PHYSICAL_DEVICE_STATUS_ASSIGNMENT_INCONSISTENT =
  'PHYSICAL_DEVICE_STATUS_ASSIGNMENT_INCONSISTENT';

export function physicalDeviceP1b2WritesDisabled() {
  return new ForbiddenException({
    code: PHYSICAL_DEVICE_P1B2_WRITES_DISABLED,
    message: 'Physical device inventory P1B.2 lifecycle write workflows are disabled',
  });
}

export function physicalDeviceNotUninstallEligible(reasonCode: string) {
  return new UnprocessableEntityException({
    code: PHYSICAL_DEVICE_NOT_UNINSTALL_ELIGIBLE,
    message: 'Physical device is not eligible for uninstall',
    reasonCode,
  });
}

export function physicalDeviceAssignmentMismatch() {
  return new ConflictException({
    code: PHYSICAL_DEVICE_ASSIGNMENT_MISMATCH,
    message: 'Assignment or vehicle does not match the active installation',
  });
}

export function physicalDeviceNotInstalled() {
  return new UnprocessableEntityException({
    code: PHYSICAL_DEVICE_NOT_INSTALLED,
    message: 'Physical device has no active vehicle installation',
  });
}

export function physicalDeviceLifecycleNotEligible(reasonCode: string) {
  return new UnprocessableEntityException({
    code: PHYSICAL_DEVICE_LIFECYCLE_NOT_ELIGIBLE,
    message: 'Physical device lifecycle transition is not allowed',
    reasonCode,
  });
}

export function physicalDeviceLossEvidenceInsufficient(reasonCode: string) {
  return new UnprocessableEntityException({
    code: PHYSICAL_DEVICE_LOSS_EVIDENCE_INSUFFICIENT,
    message: 'Loss attestation evidence is insufficient',
    reasonCode,
  });
}

export function physicalDeviceActiveVehicleAssignment() {
  return new UnprocessableEntityException({
    code: PHYSICAL_DEVICE_ACTIVE_VEHICLE_ASSIGNMENT,
    message: 'Resolve the active vehicle installation before this lifecycle action',
  });
}

export function physicalDeviceAssignmentIntegrityConflict() {
  return new ConflictException({
    code: PHYSICAL_DEVICE_ASSIGNMENT_INTEGRITY_CONFLICT,
    message: 'Multiple active vehicle installations detected for one physical device',
  });
}

export function physicalDeviceStatusAssignmentInconsistent(reasonCode: string) {
  return new ConflictException({
    code: PHYSICAL_DEVICE_STATUS_ASSIGNMENT_INCONSISTENT,
    message: 'Physical device status does not match assignment state',
    reasonCode,
  });
}
