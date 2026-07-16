import { BadRequestException, ConflictException } from '@nestjs/common';
import { TireSetupStatus } from '@prisma/client';

/**
 * Canonical setup lifecycle states (Prompt 5).
 *
 * Legacy enum values `DISCARDED` and `SOLD` are treated as terminal `RETIRED`
 * equivalents for transition rules — they remain in the DB enum for compatibility.
 */
export const TIRE_SETUP_LIFECYCLE_STATES = [
  'NEW',
  'ACTIVE',
  'STORED',
  'REMOVED',
  'RETIRED',
] as const;

export type TireSetupLifecycleState = (typeof TIRE_SETUP_LIFECYCLE_STATES)[number];

const TERMINAL_STATES: ReadonlySet<TireSetupStatus> = new Set([
  TireSetupStatus.REMOVED,
  TireSetupStatus.RETIRED,
  TireSetupStatus.DISCARDED,
  TireSetupStatus.SOLD,
]);

const HEALTH_ELIGIBLE_STATES: ReadonlySet<TireSetupStatus> = new Set([
  TireSetupStatus.ACTIVE,
]);

const ALLOWED_TRANSITIONS: Record<TireSetupStatus, ReadonlySet<TireSetupStatus>> = {
  [TireSetupStatus.NEW]: new Set([TireSetupStatus.ACTIVE, TireSetupStatus.REMOVED]),
  [TireSetupStatus.ACTIVE]: new Set([
    TireSetupStatus.STORED,
    TireSetupStatus.REMOVED,
    TireSetupStatus.RETIRED,
    TireSetupStatus.DISCARDED,
    TireSetupStatus.SOLD,
  ]),
  [TireSetupStatus.STORED]: new Set([
    TireSetupStatus.ACTIVE,
    TireSetupStatus.REMOVED,
    TireSetupStatus.RETIRED,
    TireSetupStatus.DISCARDED,
    TireSetupStatus.SOLD,
  ]),
  [TireSetupStatus.REMOVED]: new Set([]),
  [TireSetupStatus.RETIRED]: new Set([]),
  [TireSetupStatus.DISCARDED]: new Set([]),
  [TireSetupStatus.SOLD]: new Set([]),
};

export function normalizeSetupLifecycleState(
  status: TireSetupStatus,
): TireSetupLifecycleState {
  switch (status) {
    case TireSetupStatus.NEW:
      return 'NEW';
    case TireSetupStatus.ACTIVE:
      return 'ACTIVE';
    case TireSetupStatus.STORED:
      return 'STORED';
    case TireSetupStatus.REMOVED:
      return 'REMOVED';
    case TireSetupStatus.RETIRED:
    case TireSetupStatus.DISCARDED:
    case TireSetupStatus.SOLD:
      return 'RETIRED';
    default:
      return 'REMOVED';
  }
}

export function isTerminalSetupStatus(status: TireSetupStatus): boolean {
  return TERMINAL_STATES.has(status);
}

export function isHealthEligibleSetupStatus(status: TireSetupStatus): boolean {
  return HEALTH_ELIGIBLE_STATES.has(status);
}

export function canTransitionSetupStatus(
  from: TireSetupStatus,
  to: TireSetupStatus,
): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.has(to) ?? false;
}

export function assertSetupStatusTransition(
  from: TireSetupStatus,
  to: TireSetupStatus,
  context?: string,
): void {
  if (!canTransitionSetupStatus(from, to)) {
    throw new BadRequestException(
      `Invalid tire setup lifecycle transition${context ? ` (${context})` : ''}: ${from} → ${to}`,
    );
  }
}

export function assertHealthEligibleSetup(
  status: TireSetupStatus,
  context?: string,
): void {
  if (!isHealthEligibleSetupStatus(status)) {
    throw new BadRequestException(
      `Tire setup is not eligible for current health operations${context ? ` (${context})` : ''}: status=${status}`,
    );
  }
}

export function mapArchiveStatus(
  status?: TireSetupStatus | null,
): TireSetupStatus {
  if (!status) return TireSetupStatus.STORED;
  if (status === TireSetupStatus.DISCARDED || status === TireSetupStatus.SOLD) {
    return TireSetupStatus.RETIRED;
  }
  return status;
}

export function isUniqueActiveSetupViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  if (code !== 'P2002') return false;
  const target = (error as { meta?: { target?: string[] | string } }).meta?.target;
  if (Array.isArray(target)) {
    return target.some((t) => String(t).includes('one_active_setup_per_vehicle'));
  }
  return String(target ?? '').includes('one_active_setup_per_vehicle');
}

export function isUniqueActiveTirePositionViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  if (code !== 'P2002') return false;
  const target = (error as { meta?: { target?: string[] | string } }).meta?.target;
  if (Array.isArray(target)) {
    return target.some((t) => String(t).includes('one_active_tire_per_setup_position'));
  }
  return String(target ?? '').includes('one_active_tire_per_setup_position');
}

export function rethrowLifecycleInvariantViolation(error: unknown): never {
  if (isUniqueActiveSetupViolation(error)) {
    throw new ConflictException(
      'Vehicle already has an active tire setup. Concurrent activation was rejected.',
    );
  }
  if (isUniqueActiveTirePositionViolation(error)) {
    throw new ConflictException(
      'Duplicate active tire position detected for this setup. Concurrent write was rejected.',
    );
  }
  throw error;
}
