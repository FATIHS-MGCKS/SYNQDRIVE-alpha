import { BadRequestException } from '@nestjs/common';
import { VehicleStatus } from '@prisma/client';

const CANONICAL = new Set<string>(Object.values(VehicleStatus));

// Workflow configs and legacy UI surfaces store human-friendly status labels
// ("Maintenance", "In Wartung", "Active Rented", …). Prisma only accepts the
// canonical VehicleStatus enum, so every workflow-supplied status must be
// normalised through this map before it ever reaches the database.
// Keys are normalised via normalizeKey() (UPPER_SNAKE, umlauts preserved).
const LABEL_MAP: Record<string, VehicleStatus> = {
  // → AVAILABLE
  AVAILABLE: 'AVAILABLE',
  VERFÜGBAR: 'AVAILABLE',
  // → RENTED
  RENTED: 'RENTED',
  ACTIVE_RENTED: 'RENTED',
  VERMIETET: 'RENTED',
  // → IN_SERVICE (maintenance)
  IN_SERVICE: 'IN_SERVICE',
  MAINTENANCE: 'IN_SERVICE',
  IN_MAINTENANCE: 'IN_SERVICE',
  IN_WARTUNG: 'IN_SERVICE',
  WARTUNG: 'IN_SERVICE',
  // → OUT_OF_SERVICE (unavailable / blocked)
  OUT_OF_SERVICE: 'OUT_OF_SERVICE',
  UNAVAILABLE: 'OUT_OF_SERVICE',
  BLOCKED: 'OUT_OF_SERVICE',
  NICHT_VERFÜGBAR: 'OUT_OF_SERVICE',
  // → RESERVED
  RESERVED: 'RESERVED',
  RESERVIERT: 'RESERVED',
};

function normalizeKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

/**
 * Map workflow config labels (e.g. "Maintenance", "In Maintenance") to Prisma VehicleStatus.
 */
export function normalizeVehicleStatusInput(raw?: string | null): VehicleStatus | undefined {
  if (!raw) return undefined;
  const key = normalizeKey(raw);
  if (LABEL_MAP[key]) return LABEL_MAP[key];
  if (CANONICAL.has(key)) return key as VehicleStatus;
  return undefined;
}

export function normalizeVehicleStatus(raw?: string | null): VehicleStatus {
  const status = normalizeVehicleStatusInput(raw);
  if (!status) {
    throw new BadRequestException(
      `Invalid vehicle status: ${String(raw)}. Allowed: ${[...CANONICAL].join(', ')}`,
    );
  }
  return status;
}

/**
 * Defensive normaliser for any caller that must hand a VehicleStatus to Prisma
 * (e.g. workflow `vehicle.status.update` actions). Maps UI-friendly labels to
 * the canonical enum and throws a controlled BadRequestException on unknown
 * input — never lets an unvalidated value reach the database.
 */
export function normalizeVehicleStatusForPrisma(input: unknown): VehicleStatus {
  if (typeof input !== 'string') {
    throw new BadRequestException(
      `Invalid vehicle status: ${String(input)}. Allowed: ${[...CANONICAL].join(', ')}`,
    );
  }
  return normalizeVehicleStatus(input);
}
