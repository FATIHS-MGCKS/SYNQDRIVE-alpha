import type { VehicleOffboardIntent } from './vehicle-offboard.types';
import { offboardIntentFingerprint } from './offboard-intent-session';

export function offboardIntentsMatch(a: VehicleOffboardIntent, b: VehicleOffboardIntent): boolean {
  return offboardIntentFingerprint(a) === offboardIntentFingerprint(b);
}

export class OffboardPendingIntentConflictError extends Error {
  constructor() {
    super('Another offboard operation is pending with a different intent');
    this.name = 'OffboardPendingIntentConflictError';
  }
}
