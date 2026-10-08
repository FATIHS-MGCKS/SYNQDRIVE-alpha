import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import {
  VEHICLE_OFFBOARD_REASON_CODES,
  type VehicleOffboardReasonCode,
} from '../contracts/vehicle-offboard-reason.v1';
import { parseCaptureRequestBody } from './capture-request.validation';
import { parseIdempotencyKey } from './source-adoption-request.validation';

const REASON_SET = new Set<string>(VEHICLE_OFFBOARD_REASON_CODES);

export function parseOffboardReason(value: unknown): VehicleOffboardReasonCode {
  if (typeof value !== 'string' || !REASON_SET.has(value)) {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid offboard reason');
  }
  return value as VehicleOffboardReasonCode;
}

export function parseOptionalOffboardNote(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid note');
  }
  const trimmed = value.trim();
  if (trimmed.length > 2000) {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'note is too long');
  }
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseOffboardRequestBody(body: unknown): {
  reason: VehicleOffboardReasonCode;
  idempotencyKey: string;
  note?: string;
} {
  const record = parseCaptureRequestBody(body);
  const allowedKeys = new Set(['reason', 'idempotencyKey', 'note']);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new VehicleOnboardingError(
        'INVALID_CAPTURE_PAYLOAD',
        `Unknown field in offboard body: ${key}`,
      );
    }
  }
  if (Object.prototype.hasOwnProperty.call(record, 'destinationOrganizationId')) {
    throw new VehicleOnboardingError(
      'ORG_TRANSFER_NOT_SUPPORTED',
      'Organization transfer is not supported',
    );
  }
  for (const forbidden of [
    'destinationOrganizationId',
    'organizationId',
    'vehicleId',
    'registryLifecycle',
    'actorUserId',
    'providerDisconnect',
  ]) {
    if (Object.prototype.hasOwnProperty.call(record, forbidden)) {
      throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', `Unknown field: ${forbidden}`);
    }
  }
  const note = record.note !== undefined ? parseOptionalOffboardNote(record.note) : undefined;
  return {
    reason: parseOffboardReason(record.reason),
    idempotencyKey: parseIdempotencyKey(record.idempotencyKey),
    note,
  };
}
