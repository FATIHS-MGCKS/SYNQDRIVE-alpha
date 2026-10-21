import type { VehicleRegistryLifecycleOutbox } from '@prisma/client';
import {
  OFFBOARD_OUTBOX_PAYLOAD_VERSION,
  type VehicleOffboardedOutboxPayloadV2,
} from '@modules/vehicle-onboarding/contracts/offboard-outbox-payload.v1';
import { VEHICLE_OFFBOARD_REASON_CODES } from '@modules/vehicle-onboarding/contracts/vehicle-offboard-reason.v1';

export class VehicleRegistryLifecycleBillingValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'VehicleRegistryLifecycleBillingValidationError';
  }
}

export type ValidatedVehicleOffboardedRegistryEvent = {
  outboxId: string;
  eventId: string;
  organizationId: string;
  vehicleId: string;
  occurredAt: Date;
  payloadVersion: number;
  reason: string;
  actorUserId: string | null;
};

export function validateVehicleOffboardedRegistryEvent(
  row: VehicleRegistryLifecycleOutbox,
): ValidatedVehicleOffboardedRegistryEvent {
  if (row.eventType !== 'VEHICLE_OFFBOARDED') {
    throw new VehicleRegistryLifecycleBillingValidationError(
      'UNSUPPORTED_EVENT_TYPE',
      'Unsupported registry lifecycle event type',
    );
  }

  if (!row.eventId?.trim()) {
    throw new VehicleRegistryLifecycleBillingValidationError('MISSING_EVENT_ID', 'Missing eventId');
  }
  if (!row.vehicleId?.trim()) {
    throw new VehicleRegistryLifecycleBillingValidationError('MISSING_VEHICLE_ID', 'Missing vehicleId');
  }
  if (!row.organizationId?.trim()) {
    throw new VehicleRegistryLifecycleBillingValidationError(
      'MISSING_ORGANIZATION_ID',
      'Missing organizationId',
    );
  }
  if (!(row.occurredAt instanceof Date) || Number.isNaN(row.occurredAt.getTime())) {
    throw new VehicleRegistryLifecycleBillingValidationError('INVALID_OCCURRED_AT', 'Invalid occurredAt');
  }

  if (row.payloadVersion !== OFFBOARD_OUTBOX_PAYLOAD_VERSION) {
    throw new VehicleRegistryLifecycleBillingValidationError(
      'UNSUPPORTED_PAYLOAD_VERSION',
      'Unsupported offboard payload version',
    );
  }

  const payload = row.payload as unknown as VehicleOffboardedOutboxPayloadV2 | null;
  if (!payload || typeof payload !== 'object') {
    throw new VehicleRegistryLifecycleBillingValidationError('INVALID_PAYLOAD', 'Invalid payload');
  }

  if (payload.version !== OFFBOARD_OUTBOX_PAYLOAD_VERSION) {
    throw new VehicleRegistryLifecycleBillingValidationError(
      'UNSUPPORTED_PAYLOAD_VERSION',
      'Payload version mismatch',
    );
  }

  if (payload.vehicleId !== row.vehicleId || payload.organizationId !== row.organizationId) {
    throw new VehicleRegistryLifecycleBillingValidationError(
      'PAYLOAD_ROW_MISMATCH',
      'Payload identity does not match outbox row',
    );
  }

  if (payload.registryLifecycle !== 'OFFBOARDED') {
    throw new VehicleRegistryLifecycleBillingValidationError(
      'INVALID_REGISTRY_LIFECYCLE',
      'Payload registry lifecycle must be OFFBOARDED',
    );
  }

  if (!(VEHICLE_OFFBOARD_REASON_CODES as readonly string[]).includes(payload.reason)) {
    throw new VehicleRegistryLifecycleBillingValidationError('INVALID_REASON', 'Invalid offboard reason');
  }

  if (typeof payload.offboardedAt !== 'string' || payload.offboardedAt.trim().length === 0) {
    throw new VehicleRegistryLifecycleBillingValidationError(
      'INVALID_OFFBOARDED_AT',
      'Invalid offboardedAt',
    );
  }
  const payloadOffboardedAt = new Date(payload.offboardedAt);
  if (Number.isNaN(payloadOffboardedAt.getTime())) {
    throw new VehicleRegistryLifecycleBillingValidationError(
      'INVALID_OFFBOARDED_AT',
      'Invalid offboardedAt timestamp',
    );
  }
  if (payloadOffboardedAt.getTime() !== row.occurredAt.getTime()) {
    throw new VehicleRegistryLifecycleBillingValidationError(
      'OFFBOARDED_AT_ROW_MISMATCH',
      'Payload offboardedAt must match row occurredAt',
    );
  }

  let actorUserId: string | null = null;
  if (payload.actorUserId === null || payload.actorUserId === undefined) {
    actorUserId = null;
  } else if (typeof payload.actorUserId === 'string' && payload.actorUserId.trim().length > 0) {
    actorUserId = payload.actorUserId;
  } else {
    throw new VehicleRegistryLifecycleBillingValidationError(
      'INVALID_ACTOR_USER_ID',
      'actorUserId must be null or a non-empty string',
    );
  }

  return {
    outboxId: row.id,
    eventId: row.eventId,
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    occurredAt: row.occurredAt,
    payloadVersion: row.payloadVersion,
    reason: payload.reason,
    actorUserId,
  };
}

export function buildRegistryOffboardBillingIdempotencyKey(eventId: string): string {
  return `vehicle-registry:${eventId}:billing-offboard:v1`;
}
