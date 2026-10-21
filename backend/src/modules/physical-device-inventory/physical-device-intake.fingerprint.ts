import { createHash } from 'node:crypto';
import type { ManualIntakePhysicalDeviceDto } from './dto/manual-intake-physical-device.dto';
import { normalizePhysicalDeviceIdentifiers } from './physical-device-identifier.normalize';

export function buildManualIntakePayloadFingerprint(dto: ManualIntakePhysicalDeviceDto): string {
  const normalized = normalizePhysicalDeviceIdentifiers({
    modelCode: dto.modelCode,
    serialNumber: dto.serialNumber,
    imei: dto.imei,
  });
  const payload = {
    modelCode: dto.modelCode,
    serialNumber: normalized.serialNumber,
    imei: normalized.imei,
    warehouseLocation: dto.warehouseLocation.trim(),
    ownerOrganizationId: dto.ownerOrganizationId ?? null,
    intakeNotes: dto.intakeNotes?.trim() || null,
  };
  const stable = JSON.stringify(payload, Object.keys(payload).sort() as Array<keyof typeof payload>);
  return createHash('sha256').update(stable).digest('hex');
}
