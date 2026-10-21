import { createHash } from 'crypto';

export function buildShutdownEvidenceObservationIdempotencyKey(input: {
  vehicleId: string;
  provider: string;
  providerObservationAtMs: number;
  sourceKind: string;
  sourceObservationId?: string | null;
  voltage?: number | null;
}): string {
  if (input.sourceObservationId) {
    return `shutdown-ev:${input.vehicleId}:${input.sourceObservationId}`;
  }
  const voltagePart =
    input.voltage != null && Number.isFinite(input.voltage)
      ? input.voltage.toFixed(3)
      : 'na';
  return `shutdown-ev:${input.vehicleId}:${input.provider}:${input.sourceKind}:${input.providerObservationAtMs}:${voltagePart}`;
}

export function buildTripShutdownContextIdempotencyKey(input: {
  vehicleId: string;
  tripId: string;
}): string {
  return `shutdown-ctx:${input.vehicleId}:${input.tripId}`;
}

export function hashFieldProvenance(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}
