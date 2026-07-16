import { createHash } from 'crypto';
import type { MisuseCaseType } from '@prisma/client';
import { MISUSE_CASE_LIFECYCLE_VERSION } from './misuse-case-lifecycle.config';

export type MisuseCaseInputIdentity = {
  organizationId: string;
  tripId: string;
  vehicleId: string;
  caseType: MisuseCaseType;
  tripEndTimeIso: string | null;
  behaviorEventCount: number;
  drivingEventCount: number;
  contextAnchorCount: number;
  dimoSafetyEventCount: number;
  dtcEventCount: number;
  modelVersion?: string;
};

function normalizePart(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Deterministic input fingerprint for misuse case provenance (P47).
 */
export function buildMisuseCaseInputFingerprint(identity: MisuseCaseInputIdentity): string {
  const parts = [
    identity.organizationId,
    identity.tripId,
    identity.vehicleId,
    identity.caseType,
    normalizePart(identity.tripEndTimeIso),
    normalizePart(identity.behaviorEventCount),
    normalizePart(identity.drivingEventCount),
    normalizePart(identity.contextAnchorCount),
    normalizePart(identity.dimoSafetyEventCount),
    normalizePart(identity.dtcEventCount),
    identity.modelVersion ?? MISUSE_CASE_LIFECYCLE_VERSION,
  ];

  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export function requiresMisuseCaseLifecycleRefresh(
  existing: { modelVersion: string; inputFingerprint: string } | null,
  next: { modelVersion: string; inputFingerprint: string },
): boolean {
  if (!existing) return true;
  return (
    existing.modelVersion !== next.modelVersion ||
    existing.inputFingerprint !== next.inputFingerprint
  );
}
