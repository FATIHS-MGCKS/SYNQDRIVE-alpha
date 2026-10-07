import type { VehicleRegistryLifecycleOutbox } from '@prisma/client';
import type { VehicleActivatedOutboxPayloadV1 } from '@modules/vehicle-onboarding/contracts/activation-outbox-payload.v1';
import { ACTIVATION_OUTBOX_PAYLOAD_VERSION } from '@modules/vehicle-onboarding/contracts/vo-document-versions';
import { VehicleRegistryLifecycleBillingValidationError } from './validate-vehicle-offboarded-registry-event';

export type ValidatedVehicleActivatedRegistryEvent = {
  outboxId: string;
  eventId: string;
  organizationId: string;
  vehicleId: string;
  occurredAt: Date;
  payloadVersion: number;
  onboardingCaseId: string;
};

export function validateVehicleActivatedRegistryEvent(
  row: VehicleRegistryLifecycleOutbox,
): ValidatedVehicleActivatedRegistryEvent {
  if (row.eventType !== 'VEHICLE_ACTIVATED') {
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

  if (row.payloadVersion !== ACTIVATION_OUTBOX_PAYLOAD_VERSION) {
    throw new VehicleRegistryLifecycleBillingValidationError(
      'UNSUPPORTED_PAYLOAD_VERSION',
      'Unsupported activation payload version',
    );
  }

  const payload = row.payload as unknown as VehicleActivatedOutboxPayloadV1 | null;
  if (!payload || typeof payload !== 'object') {
    throw new VehicleRegistryLifecycleBillingValidationError('INVALID_PAYLOAD', 'Invalid payload');
  }

  if (payload.version !== ACTIVATION_OUTBOX_PAYLOAD_VERSION) {
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

  if (payload.registryLifecycle !== 'ACTIVE') {
    throw new VehicleRegistryLifecycleBillingValidationError(
      'INVALID_REGISTRY_LIFECYCLE',
      'Payload registry lifecycle must be ACTIVE',
    );
  }

  if (!payload.onboardingCaseId?.trim()) {
    throw new VehicleRegistryLifecycleBillingValidationError(
      'MISSING_ONBOARDING_CASE_ID',
      'Missing onboardingCaseId',
    );
  }

  if (typeof payload.activatedAt !== 'string' || payload.activatedAt.trim().length === 0) {
    throw new VehicleRegistryLifecycleBillingValidationError(
      'INVALID_ACTIVATED_AT',
      'Invalid activatedAt',
    );
  }
  const payloadActivatedAt = new Date(payload.activatedAt);
  if (Number.isNaN(payloadActivatedAt.getTime())) {
    throw new VehicleRegistryLifecycleBillingValidationError(
      'INVALID_ACTIVATED_AT',
      'Invalid activatedAt timestamp',
    );
  }
  if (payloadActivatedAt.getTime() !== row.occurredAt.getTime()) {
    throw new VehicleRegistryLifecycleBillingValidationError(
      'ACTIVATED_AT_ROW_MISMATCH',
      'Payload activatedAt must match row occurredAt',
    );
  }

  return {
    outboxId: row.id,
    eventId: row.eventId,
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    occurredAt: row.occurredAt,
    payloadVersion: row.payloadVersion,
    onboardingCaseId: payload.onboardingCaseId,
  };
}

export function buildRegistryActivateBillingIdempotencyKey(eventId: string): string {
  return `vehicle-registry:${eventId}:billing-activate:v1`;
}
