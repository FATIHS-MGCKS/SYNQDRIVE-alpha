import { createHash } from 'crypto';

export function buildGeneralizedEvidenceIdempotencyKey(input: {
  vehicleId: string;
  sourceMeasurementId: string;
}): string {
  return `gen-ev:${input.vehicleId}:${input.sourceMeasurementId}`;
}

export function buildRestSessionOpenIdempotencyKey(input: {
  vehicleId: string;
  anchorAtMs: number;
}): string {
  return `rest-session:${input.vehicleId}:${input.anchorAtMs}`;
}

export function hashGeneralizedFieldProvenance(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}
