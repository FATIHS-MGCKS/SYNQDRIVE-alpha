import { randomUUID } from 'node:crypto';
import type { OrganizationOffboardingExecutionProgress } from './organization-offboarding-execution.progress';

const DEFAULT_LEASE_MS = 15 * 60 * 1000;
const MIN_LEASE_MS = 5_000;
const MAX_LEASE_MS = 60 * 60 * 1000;

export function executionLeaseTtlMs(): number {
  const raw = process.env.ORGANIZATION_OFFBOARDING_EXECUTION_LEASE_MS;
  if (raw && /^\d+$/.test(raw)) {
    const parsed = Number.parseInt(raw, 10);
    if (parsed < MIN_LEASE_MS || parsed > MAX_LEASE_MS) {
      return DEFAULT_LEASE_MS;
    }
    return parsed;
  }
  return DEFAULT_LEASE_MS;
}

export function isExecutionLeaseActive(
  progress: OrganizationOffboardingExecutionProgress,
  nowMs = Date.now(),
): boolean {
  const lease = progress.executionLease;
  if (!lease?.token || !lease.expiresAt) return false;
  return Date.parse(lease.expiresAt) > nowMs;
}

export function mintExecutionLease(
  progress: OrganizationOffboardingExecutionProgress,
  executionIdempotencyKey: string,
): OrganizationOffboardingExecutionProgress {
  const fence = (progress.executionLease?.fence ?? 0) + 1;
  const expiresAt = new Date(Date.now() + executionLeaseTtlMs()).toISOString();
  return {
    ...progress,
    executionLease: {
      token: randomUUID(),
      fence,
      expiresAt,
      executionIdempotencyKey,
    },
  };
}

export function releaseExecutionLease(
  progress: OrganizationOffboardingExecutionProgress,
): OrganizationOffboardingExecutionProgress {
  const { executionLease: _ignored, ...rest } = progress;
  return rest;
}