import { newIdempotencyKey } from '../../lib/mfa';
import type { VehicleOffboardReasonCode } from './vehicle-offboard.types';

export type OffboardSemanticIntent = {
  organizationId: string;
  vehicleId: string;
  reason: VehicleOffboardReasonCode;
  note?: string;
};

export function offboardIntentFingerprint(intent: OffboardSemanticIntent): string {
  return `${intent.organizationId}|${intent.vehicleId}|${intent.reason}|${intent.note ?? ''}`;
}

export type OffboardIntentSession = {
  resolveIdempotencyKey: (intent: OffboardSemanticIntent) => string;
  peekIdempotencyKey: () => string | null;
  peekFingerprint: () => string | null;
  settle: () => void;
  abandon: () => void;
};

export function createOffboardIntentSession(): OffboardIntentSession {
  let idempotencyKey: string | null = null;
  let fingerprint: string | null = null;

  return {
    resolveIdempotencyKey(intent: OffboardSemanticIntent): string {
      const nextFingerprint = offboardIntentFingerprint(intent);
      if (!idempotencyKey || fingerprint !== nextFingerprint) {
        idempotencyKey = newIdempotencyKey('vehicle-offboard');
        fingerprint = nextFingerprint;
      }
      return idempotencyKey;
    },
    peekIdempotencyKey() {
      return idempotencyKey;
    },
    peekFingerprint() {
      return fingerprint;
    },
    settle() {
      idempotencyKey = null;
      fingerprint = null;
    },
    abandon() {
      idempotencyKey = null;
      fingerprint = null;
    },
  };
}
