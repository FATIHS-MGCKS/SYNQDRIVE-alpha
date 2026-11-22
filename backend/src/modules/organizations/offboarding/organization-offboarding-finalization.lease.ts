import { randomUUID } from 'node:crypto';
import type { OrganizationOffboardingExecutionProgress } from './organization-offboarding-execution.progress';

const DEFAULT_FINALIZE_LEASE_MS = 5 * 60 * 1000;
const MIN_MS = 3_000;
const MAX_MS = 30 * 60 * 1000;

export function finalizeLeaseTtlMs(): number {
  const raw = process.env.ORGANIZATION_OFFBOARDING_FINALIZE_LEASE_MS;
  if (raw && /^\d+$/.test(raw)) {
    const parsed = Number.parseInt(raw, 10);
    if (parsed < MIN_MS || parsed > MAX_MS) {
      return DEFAULT_FINALIZE_LEASE_MS;
    }
    return parsed;
  }
  return DEFAULT_FINALIZE_LEASE_MS;
}

export function isFinalizeLeaseActive(
  progress: OrganizationOffboardingExecutionProgress,
  nowMs = Date.now(),
): boolean {
  const lease = progress.finalizeLease;
  if (!lease?.token || !lease.expiresAt) return false;
  return Date.parse(lease.expiresAt) > nowMs;
}

export function mintFinalizeLease(
  progress: OrganizationOffboardingExecutionProgress,
  finalizeIdempotencyKey: string,
): OrganizationOffboardingExecutionProgress {
  const fence = (progress.finalizeLease?.fence ?? 0) + 1;
  return {
    ...progress,
    finalize: {
      idempotencyKey: finalizeIdempotencyKey,
      claimedAt: progress.finalize?.claimedAt ?? new Date().toISOString(),
      actorUserId: progress.finalize?.actorUserId ?? null,
      inProgress: true,
    },
    finalizeLease: {
      token: randomUUID(),
      fence,
      expiresAt: new Date(Date.now() + finalizeLeaseTtlMs()).toISOString(),
      finalizeIdempotencyKey,
    },
  };
}

export function releaseFinalizeLease(
  progress: OrganizationOffboardingExecutionProgress,
): OrganizationOffboardingExecutionProgress {
  const { finalizeLease: _ignored, ...rest } = progress;
  return {
    ...rest,
    finalize: rest.finalize
      ? { ...rest.finalize, inProgress: false }
      : undefined,
  };
}