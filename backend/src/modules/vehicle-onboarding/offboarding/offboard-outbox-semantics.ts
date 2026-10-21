import type { VehicleRegistryLifecycleOutbox } from '@prisma/client';
import type { VehicleOffboardReasonCode } from '../contracts/vehicle-offboard-reason.v1';
import {
  OFFBOARD_OUTBOX_PAYLOAD_VERSION,
  type VehicleOffboardedOutboxPayloadV1,
  type VehicleOffboardedOutboxPayloadV2,
} from '../contracts/offboard-outbox-payload.v1';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

export type ExpectedOffboardOutboxSemantics = {
  vehicleId: string;
  organizationId: string;
  reason: VehicleOffboardReasonCode;
  payloadVersion: number;
};

export function parseOffboardOutboxPayload(
  payload: unknown,
): VehicleOffboardedOutboxPayloadV1 | VehicleOffboardedOutboxPayloadV2 | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (p.vehicleId !== undefined && p.reason !== undefined) {
    return payload as VehicleOffboardedOutboxPayloadV1 | VehicleOffboardedOutboxPayloadV2;
  }
  return null;
}

export function offboardOutboxSemanticMatch(
  existing: Pick<
    VehicleRegistryLifecycleOutbox,
    'eventType' | 'vehicleId' | 'organizationId' | 'payloadVersion' | 'payload'
  >,
  expected: ExpectedOffboardOutboxSemantics,
): boolean {
  const existingPayload = parseOffboardOutboxPayload(existing.payload);
  return (
    existing.eventType === 'VEHICLE_OFFBOARDED' &&
    existing.vehicleId === expected.vehicleId &&
    existing.organizationId === expected.organizationId &&
    existing.payloadVersion === expected.payloadVersion &&
    existingPayload?.vehicleId === expected.vehicleId &&
    existingPayload?.reason === expected.reason
  );
}

export function assertOffboardOutboxSemanticMatch(
  existing: Pick<
    VehicleRegistryLifecycleOutbox,
    'eventType' | 'vehicleId' | 'organizationId' | 'payloadVersion' | 'payload'
  >,
  expected: ExpectedOffboardOutboxSemantics,
): void {
  if (!offboardOutboxSemanticMatch(existing, expected)) {
    throw new VehicleOnboardingError(
      'OUTBOX_IDEMPOTENCY_CONFLICT',
      'Lifecycle outbox idempotency key belongs to a different offboarding',
    );
  }
}

export function buildExpectedOffboardSemantics(
  input: Pick<ExpectedOffboardOutboxSemantics, 'vehicleId' | 'organizationId' | 'reason'>,
): ExpectedOffboardOutboxSemantics {
  return {
    ...input,
    payloadVersion: OFFBOARD_OUTBOX_PAYLOAD_VERSION,
  };
}
