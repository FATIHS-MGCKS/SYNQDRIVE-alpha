import { ConflictException, NotFoundException } from '@nestjs/common';

export const PHYSICAL_DEVICE_SERIAL_CONFLICT = 'PHYSICAL_DEVICE_SERIAL_ALREADY_REGISTERED';
export const PHYSICAL_DEVICE_IMEI_CONFLICT = 'PHYSICAL_DEVICE_IMEI_ALREADY_REGISTERED';
export const PHYSICAL_DEVICE_OWNER_ORG_NOT_FOUND = 'PHYSICAL_DEVICE_OWNER_ORG_NOT_FOUND';

export function physicalDeviceSerialConflict(serial: string) {
  return new ConflictException({
    code: PHYSICAL_DEVICE_SERIAL_CONFLICT,
    message: 'A physical device with this serial number is already in inventory',
    serialNumber: serial,
  });
}

export function physicalDeviceImeiConflict(imei: string) {
  return new ConflictException({
    code: PHYSICAL_DEVICE_IMEI_CONFLICT,
    message: 'A physical device with this IMEI is already in inventory',
    imei,
  });
}

export function physicalDeviceOwnerOrgNotFound(organizationId: string) {
  return new NotFoundException({
    code: PHYSICAL_DEVICE_OWNER_ORG_NOT_FOUND,
    message: 'Owner organization was not found',
    organizationId,
  });
}
