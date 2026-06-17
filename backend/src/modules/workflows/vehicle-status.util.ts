import { BadRequestException } from '@nestjs/common';
import { VehicleStatus } from '@prisma/client';

const CANONICAL = new Set<string>(Object.values(VehicleStatus));

/** Legacy workflow / UI labels → canonical VehicleStatus. */
const LABEL_MAP: Record<string, VehicleStatus> = {
  MAINTENANCE: 'IN_SERVICE',
  IN_MAINTENANCE: 'IN_SERVICE',
  IN_SERVICE: 'IN_SERVICE',
  AVAILABLE: 'AVAILABLE',
  RENTED: 'RENTED',
  OUT_OF_SERVICE: 'OUT_OF_SERVICE',
  RESERVED: 'RESERVED',
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
