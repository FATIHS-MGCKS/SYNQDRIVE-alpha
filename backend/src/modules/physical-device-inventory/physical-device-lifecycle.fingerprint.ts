import { createHash } from 'node:crypto';
import type { MarkPhysicalDeviceDefectiveDto } from './dto/mark-physical-device-defective.dto';
import type { MarkPhysicalDeviceLostDto } from './dto/mark-physical-device-lost.dto';
import type { RetirePhysicalDeviceDto } from './dto/retire-physical-device.dto';
import type { ReturnPhysicalDeviceToStockDto } from './dto/return-physical-device-to-stock.dto';
import type { UninstallPhysicalDeviceDto } from './dto/uninstall-physical-device.dto';

function hashPayload(parts: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function buildUninstallPayloadFingerprint(
  deviceId: string,
  dto: UninstallPhysicalDeviceDto,
): string {
  return hashPayload({
    action: 'UNINSTALL',
    deviceId,
    vehicleId: dto.vehicleId,
    assignmentId: dto.assignmentId,
    deviceConditionAfterUninstall: dto.deviceConditionAfterUninstall,
    physicalReturnConfirmed: dto.physicalReturnConfirmed,
    warehouseLocation: dto.warehouseLocation?.trim() ?? null,
    uninstallReason: dto.uninstallReason.trim(),
    defectDescription: dto.defectDescription?.trim() ?? null,
  });
}

export function buildReturnToStockPayloadFingerprint(
  deviceId: string,
  dto: ReturnPhysicalDeviceToStockDto,
): string {
  return hashPayload({
    action: 'RETURN_TO_STOCK',
    deviceId,
    warehouseLocation: dto.warehouseLocation.trim(),
    returnNotes: dto.returnNotes?.trim() ?? null,
  });
}

export function buildMarkDefectivePayloadFingerprint(
  deviceId: string,
  dto: MarkPhysicalDeviceDefectiveDto,
): string {
  return hashPayload({
    action: 'MARK_DEFECTIVE',
    deviceId,
    defectDescription: dto.defectDescription.trim(),
  });
}

export function buildMarkLostPayloadFingerprint(
  deviceId: string,
  dto: MarkPhysicalDeviceLostDto,
): string {
  return hashPayload({
    action: 'MARK_LOST',
    deviceId,
    lossAttestationKind: dto.lossAttestationKind,
    lossEvidenceNotes: dto.lossEvidenceNotes.trim(),
  });
}

export function buildRetirePayloadFingerprint(deviceId: string, dto: RetirePhysicalDeviceDto): string {
  return hashPayload({
    action: 'RETIRE',
    deviceId,
    retireReason: dto.retireReason.trim(),
  });
}
