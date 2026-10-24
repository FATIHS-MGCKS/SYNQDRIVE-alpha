import { createHash } from 'node:crypto';
import type { MotionPhysicsIdentityFingerprint } from './motion-physics-reference.domain';

export function hashVinForFingerprint(vin: string | null | undefined): string | null {
  const normalized = vin?.trim().toUpperCase();
  if (!normalized) return null;
  return createHash('sha256').update(`synqdrive:vin:${normalized}`).digest('hex');
}

export function buildMotionPhysicsIdentityFingerprint(input: {
  vin?: string | null;
  make: string;
  model: string;
  modelYear: number;
  variantLabel?: string | null;
}): MotionPhysicsIdentityFingerprint {
  return {
    vinHash: hashVinForFingerprint(input.vin),
    make: input.make.trim(),
    model: input.model.trim(),
    modelYear: input.modelYear,
    variantLabel: input.variantLabel?.trim() || null,
  };
}

export function identityFingerprintsMatch(
  stored: MotionPhysicsIdentityFingerprint,
  current: MotionPhysicsIdentityFingerprint,
): boolean {
  if (stored.make.toLowerCase() !== current.make.toLowerCase()) return false;
  if (stored.model.toLowerCase() !== current.model.toLowerCase()) return false;
  if (stored.modelYear !== current.modelYear) return false;
  if (stored.vinHash || current.vinHash) {
    if (!stored.vinHash || !current.vinHash) return false;
    if (stored.vinHash !== current.vinHash) return false;
  }
  return true;
}
