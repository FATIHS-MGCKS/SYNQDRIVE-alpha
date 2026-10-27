import type { FuelType } from '@prisma/client';
import type {
  RegistrationIdentityCanonicalFieldKey,
  RegistrationIdentityFieldProvenanceEntry,
  RegistrationIdentityProvenanceDocument,
} from './vehicle-identity-canonical.types';
import { isProtectedProvenanceEntry } from './vehicle-identity-provenance.util';

/** AI / spec keys that map to a single canonical provenance field. */
export const PROVENANCE_KEY_ALIASES: Record<string, RegistrationIdentityCanonicalFieldKey> = {
  engineDisplacementCc: 'displacementCc',
};

export type RegistrationIdentityExtendedProvenanceKey =
  | RegistrationIdentityCanonicalFieldKey
  | 'systemMotorPowerKw'
  | 'resolvedVariant';

export function normalizeProvenanceStorageKey(
  key: string,
): RegistrationIdentityExtendedProvenanceKey {
  const alias = PROVENANCE_KEY_ALIASES[key];
  if (alias) return alias;
  return key as RegistrationIdentityExtendedProvenanceKey;
}

export type VehicleIdentityVehicleScalarKey = 'make' | 'model' | 'year' | 'vin' | 'fuelType';

const CANONICAL_TO_VEHICLE_SCALAR: Partial<
  Record<RegistrationIdentityCanonicalFieldKey, VehicleIdentityVehicleScalarKey>
> = {
  make: 'make',
  model: 'model',
  year: 'year',
  vin: 'vin',
  fuelType: 'fuelType',
};

export function vehicleScalarKeyForCanonical(
  key: RegistrationIdentityCanonicalFieldKey,
): VehicleIdentityVehicleScalarKey | null {
  return CANONICAL_TO_VEHICLE_SCALAR[key] ?? null;
}

export function valuesEqual(a: string | number | boolean | null | undefined, b: string | number | boolean | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

export type VehicleScalarSnapshot = {
  make: string;
  model: string;
  year: number;
  vin: string | null;
  fuelType: FuelType;
};

export function readVehicleScalar(
  vehicle: VehicleScalarSnapshot,
  scalarKey: VehicleIdentityVehicleScalarKey,
): string | number | null {
  switch (scalarKey) {
    case 'make':
      return vehicle.make;
    case 'model':
      return vehicle.model;
    case 'year':
      return vehicle.year;
    case 'vin':
      return vehicle.vin;
    case 'fuelType':
      return vehicle.fuelType;
    default:
      return null;
  }
}

export function getProtectedProvenanceValue(
  doc: RegistrationIdentityProvenanceDocument | null,
  canonicalKey: RegistrationIdentityCanonicalFieldKey,
): RegistrationIdentityFieldProvenanceEntry | undefined {
  if (!doc?.fields) return undefined;
  const direct = doc.fields[canonicalKey];
  if (isProtectedProvenanceEntry(direct)) return direct;
  for (const [rawKey, entry] of Object.entries(doc.fields)) {
    const normalized = normalizeProvenanceStorageKey(rawKey);
    if (normalized === canonicalKey && isProtectedProvenanceEntry(entry)) {
      return entry;
    }
  }
  return undefined;
}
