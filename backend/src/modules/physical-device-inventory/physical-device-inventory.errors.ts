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
