import { createHash } from 'node:crypto';
import type { InstallPhysicalDeviceDto } from './dto/install-physical-device.dto';

export function buildInstallPayloadFingerprint(
  deviceId: string,
  dto: InstallPhysicalDeviceDto,
): string {
  const payload = {
    deviceId,
    vehicleId: dto.vehicleId,
    installConfirmation: dto.installConfirmation,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
