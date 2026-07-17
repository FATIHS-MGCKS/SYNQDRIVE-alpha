import { createHash } from 'crypto';

export const BrakeServiceApplicationErrorCode = {
  IDEMPOTENCY_KEY_REQUIRED: 'brake_idempotency_key_required',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'brake_idempotency_payload_mismatch',
  CONCURRENT_APPLICATION_IN_PROGRESS: 'brake_concurrent_application_in_progress',
  ORGANIZATION_VEHICLE_MISMATCH: 'organization_vehicle_mismatch',
  VEHICLE_NOT_FOUND: 'vehicle_not_found',
  APPLICATION_FAILED: 'brake_application_failed',
} as const;

export type BrakeServiceApplicationErrorCode =
  (typeof BrakeServiceApplicationErrorCode)[keyof typeof BrakeServiceApplicationErrorCode];

export function normalizeBrakeServiceRequestPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const sorted = Object.keys(payload as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = (payload as Record<string, unknown>)[key];
      return acc;
    }, {});
  return sorted;
}

export function hashBrakeServiceRequest(payload: unknown): string {
  const normalized = JSON.stringify(normalizeBrakeServiceRequestPayload(payload));
  return createHash('sha256').update(normalized).digest('hex');
}

export function buildBrakeServiceIdempotencyKey(input: {
  organizationId: string;
  vehicleId: string;
  clientRequestId?: string | null;
  externalDocumentId?: string | null;
  explicitKey?: string | null;
}): string {
  const explicit = input.explicitKey?.trim();
  if (explicit) return explicit;
  const client = input.clientRequestId?.trim();
  if (client) return `brake:${input.organizationId}:${input.vehicleId}:${client}`;
  const doc = input.externalDocumentId?.trim();
  if (doc) return `brake:${input.organizationId}:${input.vehicleId}:doc:${doc}`;
  throw new Error(BrakeServiceApplicationErrorCode.IDEMPOTENCY_KEY_REQUIRED);
}

export function buildBrakeOutboxIdempotencyKey(
  applicationId: string,
  eventType: string,
): string {
  return `brake-outbox:${applicationId}:${eventType}`;
}
