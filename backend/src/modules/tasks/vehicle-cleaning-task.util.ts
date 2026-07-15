import { Prisma, TaskPriority } from '@prisma/client';
import {
  CleaningPurpose,
  PreparationWindow,
  VEHICLE_CLEANING_RULE_ID,
  VEHICLE_CLEANING_RULE_VERSION,
  VEHICLE_CLEANING_TASK_DEDUP_PREFIX,
  VEHICLE_CLEANING_URGENT_BEFORE_PICKUP_HOURS,
  LEGACY_BOOKING_CLEAN_DEDUP_PREFIX,
} from './vehicle-cleaning-task.rules';

const PURPOSE_SUFFIX: Record<CleaningPurpose, string> = {
  PRE_BOOKING: 'pre-booking',
  STANDALONE: 'standalone',
};

/** Canonical dedup key: one active task per vehicle + preparation window. */
export function vehicleCleaningDedupKey(vehicleId: string, purpose: CleaningPurpose): string {
  return `${VEHICLE_CLEANING_TASK_DEDUP_PREFIX}${vehicleId}:${PURPOSE_SUFFIX[purpose]}`;
}

export function legacyBookingCleanDedupKey(bookingId: string): string {
  return `${LEGACY_BOOKING_CLEAN_DEDUP_PREFIX}${bookingId}`;
}

export function isCanonicalVehicleCleaningDedupKey(dedupKey: string | null | undefined): boolean {
  if (!dedupKey) return false;
  return dedupKey.startsWith(VEHICLE_CLEANING_TASK_DEDUP_PREFIX);
}

export function isLegacyBookingCleanDedupKey(dedupKey: string | null | undefined): boolean {
  if (!dedupKey) return false;
  return dedupKey.startsWith(LEGACY_BOOKING_CLEAN_DEDUP_PREFIX);
}

/** Pre-purpose-suffix rows (`vehicle:cleaning:{vehicleId}`) from the first bridge. */
export function isBareLegacyVehicleCleaningDedupKey(dedupKey: string | null | undefined): boolean {
  if (!dedupKey) return false;
  return /^vehicle:cleaning:[^:]+$/.test(dedupKey);
}

export function resolveCleaningPurpose(input: {
  nextBookingId?: string | null;
  preparationWindow?: PreparationWindow | null;
}): CleaningPurpose {
  if (input.nextBookingId || input.preparationWindow === 'PRE_BOOKING') {
    return 'PRE_BOOKING';
  }
  return 'STANDALONE';
}

export function resolveCleaningPriorityFromPickup(
  nextPickupAt: Date | null | undefined,
  now: Date,
): TaskPriority {
  if (!nextPickupAt) return 'NORMAL';
  const hoursUntil = (nextPickupAt.getTime() - now.getTime()) / (1000 * 60 * 60);
  return hoursUntil <= VEHICLE_CLEANING_URGENT_BEFORE_PICKUP_HOURS ? 'HIGH' : 'NORMAL';
}

export function buildVehicleCleaningMetadata(input: {
  dedupKey: string;
  vehicleId: string;
  cleaningPurpose: CleaningPurpose;
  preparationWindow?: PreparationWindow | null;
  nextBookingId?: string | null;
  nextPickupAt?: string | null;
  customerId?: string | null;
}): Prisma.InputJsonValue {
  const preparationWindow =
    input.preparationWindow ??
    (input.cleaningPurpose === 'PRE_BOOKING' ? ('PRE_BOOKING' as const) : null);

  return {
    generatedKey: input.dedupKey,
    origin: 'VEHICLE_CLEANING',
    vehicleId: input.vehicleId,
    cleaning: {
      purpose: input.cleaningPurpose,
      preparationWindow,
      nextBookingId: input.nextBookingId ?? null,
      nextPickupAt: input.nextPickupAt ?? null,
    },
    automation: {
      ruleId: VEHICLE_CLEANING_RULE_ID,
      ruleVersion: VEHICLE_CLEANING_RULE_VERSION,
      ruleScope: 'ORG',
    },
    ...(input.customerId ? { customerId: input.customerId } : {}),
  };
}

export function readCleaningMetadataNextBookingId(
  metadata: unknown,
): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const cleaning = (metadata as { cleaning?: { nextBookingId?: string | null } }).cleaning;
  return cleaning?.nextBookingId ?? null;
}
