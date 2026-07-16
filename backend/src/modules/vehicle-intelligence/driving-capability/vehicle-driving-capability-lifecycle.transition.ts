/**
 * Pure capability transition detection (P34) — signal loss and recovery.
 */
import { DrivingCapabilityStatus, type VehicleDrivingCapability } from '@prisma/client';
import { hasProviderError } from './vehicle-driving-capability.util';
import {
  CAPABILITY_SIGNAL_LOSS_STREAK_THRESHOLD,
  CAPABILITY_STATUS_HISTORY_LIMIT,
} from './vehicle-driving-capability-lifecycle.config';
import type {
  CapabilityRefreshTrigger,
  CapabilityTransition,
  CapabilityTransitionKind,
} from './vehicle-driving-capability-lifecycle.types';

const SUPPORTED_LIKE = new Set<DrivingCapabilityStatus>([
  DrivingCapabilityStatus.SUPPORTED,
  DrivingCapabilityStatus.LIMITED,
]);

const ABSENT_LIKE = new Set<DrivingCapabilityStatus>([
  DrivingCapabilityStatus.UNSUPPORTED,
  DrivingCapabilityStatus.UNKNOWN,
]);

export type CapabilityLifecycleMetadata = {
  refreshTrigger?: CapabilityRefreshTrigger;
  previousStatus?: DrivingCapabilityStatus | null;
  previousCheckedAt?: string | null;
  auditedAt?: string;
  lossStreak?: number;
  statusHistory?: Array<{
    at: string;
    from: DrivingCapabilityStatus | null;
    to: DrivingCapabilityStatus;
    trigger?: CapabilityRefreshTrigger;
  }>;
};

function readLossStreak(metadata: unknown): number {
  if (!metadata || typeof metadata !== 'object') return 0;
  const streak = (metadata as CapabilityLifecycleMetadata).lossStreak;
  return typeof streak === 'number' && streak >= 0 ? streak : 0;
}

function classifyTransition(
  previousStatus: DrivingCapabilityStatus | null,
  nextStatus: DrivingCapabilityStatus,
  metadata?: Record<string, unknown> | null,
): CapabilityTransitionKind | null {
  if (hasProviderError(metadata) && nextStatus === DrivingCapabilityStatus.DEGRADED) {
    return 'PROVIDER_DEGRADED';
  }
  if (
    previousStatus != null &&
    SUPPORTED_LIKE.has(previousStatus) &&
    ABSENT_LIKE.has(nextStatus)
  ) {
    return 'SIGNAL_LOST';
  }
  if (
    previousStatus != null &&
    (ABSENT_LIKE.has(previousStatus) || previousStatus === DrivingCapabilityStatus.DEGRADED) &&
    SUPPORTED_LIKE.has(nextStatus)
  ) {
    return 'SIGNAL_RECOVERED';
  }
  if (previousStatus != null && previousStatus !== nextStatus) {
    return 'STATUS_CHANGED';
  }
  return null;
}

export function computeNextLossStreak(
  previousStatus: DrivingCapabilityStatus | null,
  nextStatus: DrivingCapabilityStatus,
  previousStreak: number,
): number {
  if (
    previousStatus != null &&
    SUPPORTED_LIKE.has(previousStatus) &&
    ABSENT_LIKE.has(nextStatus)
  ) {
    return previousStreak + 1;
  }
  if (SUPPORTED_LIKE.has(nextStatus)) {
    return 0;
  }
  return previousStreak;
}

export function buildLifecycleMetadata(input: {
  refreshTrigger: CapabilityRefreshTrigger;
  previousRow: VehicleDrivingCapability | null;
  nextStatus: DrivingCapabilityStatus;
  checkedAt: Date;
  existingMetadata?: Record<string, unknown> | null;
}): CapabilityLifecycleMetadata & Record<string, unknown> {
  const previousStatus = input.previousRow?.capabilityStatus ?? null;
  const previousStreak = readLossStreak(input.previousRow?.metadata);
  const lossStreak = computeNextLossStreak(previousStatus, input.nextStatus, previousStreak);
  const history = Array.isArray((input.existingMetadata as CapabilityLifecycleMetadata)?.statusHistory)
    ? [...((input.existingMetadata as CapabilityLifecycleMetadata).statusHistory ?? [])]
    : [];

  if (previousStatus !== input.nextStatus) {
    history.push({
      at: input.checkedAt.toISOString(),
      from: previousStatus,
      to: input.nextStatus,
      trigger: input.refreshTrigger,
    });
  }

  return {
    ...(input.existingMetadata ?? {}),
    refreshTrigger: input.refreshTrigger,
    previousStatus,
    previousCheckedAt: input.previousRow?.checkedAt?.toISOString() ?? null,
    auditedAt: input.checkedAt.toISOString(),
    lossStreak,
    statusHistory: history.slice(-CAPABILITY_STATUS_HISTORY_LIMIT),
  };
}

export function detectCapabilityTransitions(
  beforeRows: readonly VehicleDrivingCapability[],
  afterRows: readonly VehicleDrivingCapability[],
): CapabilityTransition[] {
  const beforeByKey = new Map(beforeRows.map((row) => [row.capabilityKey, row]));
  const transitions: CapabilityTransition[] = [];

  for (const after of afterRows) {
    const before = beforeByKey.get(after.capabilityKey) ?? null;
    const kind = classifyTransition(
      before?.capabilityStatus ?? null,
      after.capabilityStatus,
      (after.metadata as Record<string, unknown> | null) ?? null,
    );
    if (!kind) continue;

    transitions.push({
      capabilityKey: after.capabilityKey,
      kind,
      previousStatus: before?.capabilityStatus ?? null,
      nextStatus: after.capabilityStatus,
      lossStreak: readLossStreak(after.metadata),
    });
  }

  return transitions;
}

export function shouldScheduleSignalLossRetry(transitions: CapabilityTransition[]): boolean {
  return transitions.some(
    (t) =>
      t.kind === 'SIGNAL_LOST' &&
      t.lossStreak >= CAPABILITY_SIGNAL_LOSS_STREAK_THRESHOLD,
  );
}

export function hasSignalReappeared(transitions: CapabilityTransition[]): boolean {
  return transitions.some((t) => t.kind === 'SIGNAL_RECOVERED');
}
