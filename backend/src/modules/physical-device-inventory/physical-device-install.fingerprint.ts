import { createHash } from 'node:crypto';
import {
  PhysicalDeviceAssignmentKind,
  PhysicalDeviceInventoryStatus,
} from '@prisma/client';
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

export function readInstallAssignmentPayloadFingerprint(metadataJson: unknown): string | null {
  if (!metadataJson || typeof metadataJson !== 'object' || Array.isArray(metadataJson)) {
    return null;
  }
  const value = (metadataJson as Record<string, unknown>).payloadFingerprint;
  return typeof value === 'string' ? value : null;
}

export type InstallIdempotencyReplayBlockReason =
  | 'IDEMPOTENCY_KEY_DEVICE_MISMATCH'
  | 'IDEMPOTENCY_KEY_ASSIGNMENT_KIND_MISMATCH'
  | 'IDEMPOTENCY_KEY_VEHICLE_MISMATCH'
  | 'IDEMPOTENCY_ASSIGNMENT_NOT_ACTIVE'
  | 'IDEMPOTENCY_FINGERPRINT_MISSING'
  | 'IDEMPOTENCY_FINGERPRINT_MISMATCH'
  | 'IDEMPOTENCY_DEVICE_STATUS_INCONSISTENT'
  | 'IDEMPOTENCY_DEVICE_ASSIGNMENT_STATE_MISMATCH';

export type InstallIdempotencyReplayAssessment =
  | { valid: true }
  | { valid: false; reason: InstallIdempotencyReplayBlockReason };

export function assessInstallIdempotencyReplay(input: {
  requestedDeviceId: string;
  requestedVehicleId: string;
  expectedPayloadFingerprint: string;
  assignment: {
    id: string;
    physicalDeviceId: string;
    assignmentKind: PhysicalDeviceAssignmentKind;
    vehicleId: string | null;
    effectiveTo: Date | null;
    metadataJson: unknown;
  } | null;
  deviceStatus: PhysicalDeviceInventoryStatus;
  activeInstallAssignmentIdsForDevice: string[];
}): InstallIdempotencyReplayAssessment {
  if (!input.assignment) {
    return { valid: false, reason: 'IDEMPOTENCY_DEVICE_ASSIGNMENT_STATE_MISMATCH' };
  }

  const assignment = input.assignment;
  if (assignment.physicalDeviceId !== input.requestedDeviceId) {
    return { valid: false, reason: 'IDEMPOTENCY_KEY_DEVICE_MISMATCH' };
  }
  if (assignment.assignmentKind !== PhysicalDeviceAssignmentKind.INSTALL) {
    return { valid: false, reason: 'IDEMPOTENCY_KEY_ASSIGNMENT_KIND_MISMATCH' };
  }
  if (assignment.vehicleId !== input.requestedVehicleId) {
    return { valid: false, reason: 'IDEMPOTENCY_KEY_VEHICLE_MISMATCH' };
  }
  if (assignment.effectiveTo != null) {
    return { valid: false, reason: 'IDEMPOTENCY_ASSIGNMENT_NOT_ACTIVE' };
  }

  const storedFingerprint = readInstallAssignmentPayloadFingerprint(assignment.metadataJson);
  if (!storedFingerprint) {
    return { valid: false, reason: 'IDEMPOTENCY_FINGERPRINT_MISSING' };
  }
  if (storedFingerprint !== input.expectedPayloadFingerprint) {
    return { valid: false, reason: 'IDEMPOTENCY_FINGERPRINT_MISMATCH' };
  }

  if (input.deviceStatus !== PhysicalDeviceInventoryStatus.INSTALLED) {
    return { valid: false, reason: 'IDEMPOTENCY_DEVICE_STATUS_INCONSISTENT' };
  }

  const activeIds = input.activeInstallAssignmentIdsForDevice;
  if (activeIds.length !== 1 || activeIds[0] !== assignment.id) {
    return { valid: false, reason: 'IDEMPOTENCY_DEVICE_ASSIGNMENT_STATE_MISMATCH' };
  }

  return { valid: true };
}
