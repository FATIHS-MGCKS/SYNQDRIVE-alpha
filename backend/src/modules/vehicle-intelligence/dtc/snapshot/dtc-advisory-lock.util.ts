import { createHash } from 'crypto';

/** Stable 32-bit advisory lock key for per-vehicle DTC snapshot apply. */
export function dtcSnapshotAdvisoryLockKey(vehicleId: string): number {
  const digest = createHash('sha256').update(`dtc01b:${vehicleId}`).digest();
  return digest.readInt32BE(0);
}
