import { ConflictException, NotFoundException } from '@nestjs/common';

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
